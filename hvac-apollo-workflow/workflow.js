/**
 * HVAC Lead Generation Workflow
 * ──────────────────────────────
 * Searches Apollo.io for owner-operated HVAC companies in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends up to MAX_LEADS
 * new leads per run. Runs automatically via node-cron at 7 AM Eastern.
 *
 * Usage:
 *   node workflow.js              → start the scheduler (runs daily at 7am ET)
 *   node workflow.js --run-once  → execute immediately without waiting for schedule
 */

'use strict';

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────────

const APOLLO_API_KEY        = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID        = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME            = process.env.GOOGLE_SHEET_NAME || 'Leads';
const KEY_PATH              = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './google-service-account-key.json';
const MAX_LEADS             = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const CRON_SCHEDULE         = process.env.CRON_SCHEDULE || '0 12 * * *'; // 7am ET (UTC-5)

const ALERT_TO              = process.env.ALERT_EMAIL_TO || '';
const ALERT_FROM            = process.env.ALERT_EMAIL_FROM || '';
const GMAIL_APP_PASSWORD    = process.env.GMAIL_APP_PASSWORD || '';

// Southwest Michigan cities to target
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Decision-maker job titles in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Keywords that help Apollo narrow to HVAC / plumbing / mechanical
const INDUSTRY_KEYWORDS = 'HVAC heating air conditioning plumbing mechanical contracting';

// Google Sheets column order — indices match the sheet columns A-I
const COLUMNS = {
  DATE_ADDED:       0,  // A
  BUSINESS_NAME:    1,  // B  ← duplicate check key
  OWNER_FIRST:      2,  // C
  OWNER_LAST:       3,  // D
  PHONE:            4,  // E
  CITY:             5,  // F
  WEBSITE:          6,  // G
  CALLED:           7,  // H  (blank, filled by user)
  NOTES:            8,  // I  (blank, filled by user)
};

const HEADER_ROW = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

// ─── Google Sheets auth ────────────────────────────────────────────────────────

function getSheetClient() {
  const keyFilePath = path.resolve(KEY_PATH);
  if (!fs.existsSync(keyFilePath)) {
    throw new Error(
      `Google service account key not found at: ${keyFilePath}\n` +
      'Download it from Google Cloud Console → IAM → Service Accounts → Keys.'
    );
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ─── Sheet helpers ─────────────────────────────────────────────────────────────

/**
 * Ensures the header row exists. Writes it only if the sheet is empty.
 */
async function ensureHeader(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:I1`,
  });
  const rows = res.data.values || [];
  if (rows.length === 0 || rows[0][0] !== 'Date Added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    log('Header row written to sheet.');
  }
}

/**
 * Returns a Set of business names already present in the sheet (lowercased).
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    // Column B only (Business Name), skip header
    range: `${SHEET_NAME}!B2:B`,
  });
  const rows = res.data.values || [];
  return new Set(rows.flat().map((name) => name.trim().toLowerCase()));
}

/**
 * Appends an array of row arrays to the sheet.
 */
async function appendRows(sheets, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Apollo search ─────────────────────────────────────────────────────────────

/**
 * Searches Apollo for HVAC decision-makers in SW Michigan.
 * Apollo's people search: POST /v1/mixed_people/search
 *
 * We iterate over TARGET_CITIES so that the location filter stays tight.
 * Apollo returns at most `per_page` results per call; we stop collecting
 * once we have MAX_LEADS candidates (pre-dedupe).
 */
async function searchApolloLeads() {
  const allPeople = [];
  const seenApolloIds = new Set();

  for (const city of TARGET_CITIES) {
    if (allPeople.length >= MAX_LEADS * 3) break; // collect extra buffer for dedupe

    try {
      const response = await axios.post(
        'https://api.apollo.io/v1/mixed_people/search',
        {
          api_key: APOLLO_API_KEY,
          q_keywords: INDUSTRY_KEYWORDS,
          person_titles: TARGET_TITLES,
          person_locations: [city],
          organization_locations: ['Michigan, United States'],
          // 1–25 employees
          organization_num_employees_ranges: ['1,25'],
          // Only include contacts with a known phone
          contact_email_status: [],
          page: 1,
          per_page: 25,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          timeout: 30000,
        }
      );

      const people = response.data?.people || response.data?.contacts || [];
      log(`  Apollo returned ${people.length} results for "${city}".`);

      for (const person of people) {
        if (!seenApolloIds.has(person.id)) {
          seenApolloIds.add(person.id);
          allPeople.push(person);
        }
      }
    } catch (err) {
      // Don't abort the whole run — log and keep going with other cities
      log(`  WARNING: Apollo query failed for "${city}": ${err.message}`);
    }
  }

  return allPeople;
}

// ─── Data extraction ───────────────────────────────────────────────────────────

/**
 * Extracts a usable phone number from an Apollo person record.
 * Apollo returns direct/mobile numbers in person.phone_numbers[]
 * and organization-level numbers in organization.primary_phone.
 */
function extractPhone(person) {
  // Direct/mobile numbers come first (most valuable)
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    const direct = person.phone_numbers.find(
      (p) => p.type === 'direct' || p.type === 'mobile'
    );
    if (direct?.sanitized_number) return direct.sanitized_number;
    if (person.phone_numbers[0]?.sanitized_number) {
      return person.phone_numbers[0].sanitized_number;
    }
  }
  // Fall back to company main line
  return person.organization?.primary_phone?.sanitized_number || '';
}

/**
 * Normalizes an Apollo person record into our sheet row format.
 */
function personToRow(person, today) {
  const org = person.organization || {};
  return [
    today,                                          // Date Added
    org.name || '',                                 // Business Name
    person.first_name || '',                        // Owner First Name
    person.last_name || '',                         // Owner Last Name
    extractPhone(person),                           // Phone Number
    person.city || org.city || '',                 // City
    org.website_url || '',                          // Website
    '',                                             // Called (user fills in)
    '',                                             // Notes (user fills in)
  ];
}

// ─── Main run ─────────────────────────────────────────────────────────────────

async function runWorkflow() {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  log('═══════════════════════════════════════════════════');
  log(`HVAC Lead Workflow  —  ${today}`);
  log('═══════════════════════════════════════════════════');

  try {
    validateEnv();

    // ── Step 1: Connect to Google Sheets ──────────────────────────────
    log('Connecting to Google Sheets…');
    const sheets = getSheetClient();
    await ensureHeader(sheets);

    // ── Step 2: Load existing business names for dedupe ───────────────
    log('Loading existing entries for duplicate check…');
    const existing = await getExistingBusinessNames(sheets);
    log(`  Found ${existing.size} existing business(es) in sheet.`);

    // ── Step 3: Search Apollo ─────────────────────────────────────────
    log('Searching Apollo.io for HVAC leads in Southwest Michigan…');
    const people = await searchApolloLeads();
    log(`Apollo total unique candidates: ${people.length}`);

    if (people.length === 0) {
      const msg = 'Apollo returned 0 results. No leads added this run.';
      log(`WARNING: ${msg}`);
      await sendAlert('HVAC Workflow — 0 Apollo results', msg);
      return;
    }

    // ── Step 4: Filter — no phone, no entry ───────────────────────────
    const withPhone = people.filter((p) => !!extractPhone(p));
    log(`After phone filter: ${withPhone.length} candidate(s) have a phone number.`);

    // ── Step 5: Deduplicate against existing sheet rows ───────────────
    const newPeople = withPhone.filter((p) => {
      const bizName = (p.organization?.name || '').trim().toLowerCase();
      return bizName && !existing.has(bizName);
    });
    log(`After dedupe: ${newPeople.length} new business(es) not yet in sheet.`);

    if (newPeople.length === 0) {
      log('No new leads to add — all results already in sheet.');
      return;
    }

    // ── Step 6: Cap at MAX_LEADS and build rows ───────────────────────
    const batch = newPeople.slice(0, MAX_LEADS);
    const rows = batch.map((p) => personToRow(p, today));

    // ── Step 7: Append to sheet ───────────────────────────────────────
    log(`Appending ${rows.length} new lead(s) to sheet…`);
    await appendRows(sheets, rows);

    log('✓ Done.');
    log(`  Added ${rows.length} lead(s). Names:`);
    rows.forEach((r) => log(`    • ${r[COLUMNS.BUSINESS_NAME]} — ${r[COLUMNS.OWNER_FIRST]} ${r[COLUMNS.OWNER_LAST]}`));

  } catch (err) {
    const subject = 'HVAC Workflow — ERROR';
    const body = `The HVAC lead generation workflow failed.\n\nError: ${err.message}\n\nStack:\n${err.stack}`;
    log(`\nERROR: ${err.message}`);
    await sendAlert(subject, body);
  }
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validateEnv() {
  const missing = [];
  if (!APOLLO_API_KEY)   missing.push('APOLLO_API_KEY');
  if (!SPREADSHEET_ID)   missing.push('GOOGLE_SPREADSHEET_ID');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// ─── Email alerts ──────────────────────────────────────────────────────────────

async function sendAlert(subject, body) {
  if (!ALERT_TO || !ALERT_FROM || !GMAIL_APP_PASSWORD) {
    log('[Alert] Email not configured — logging to console only.');
    log(`[Alert] Subject: ${subject}`);
    log(`[Alert] Body: ${body}`);
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: ALERT_FROM, pass: GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject,
      text: body,
    });
    log(`[Alert] Error email sent to ${ALERT_TO}.`);
  } catch (mailErr) {
    log(`[Alert] Failed to send email: ${mailErr.message}`);
  }
}

// ─── Logging ───────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// ─── Entry point ───────────────────────────────────────────────────────────────

const runOnce = process.argv.includes('--run-once');

if (runOnce) {
  log('Running immediately (--run-once flag)…');
  runWorkflow();
} else {
  log(`Scheduler started. Cron: "${CRON_SCHEDULE}" (UTC)`);
  log('The workflow will run automatically at 7 AM Eastern.');
  log('To run immediately, use: node workflow.js --run-once');

  cron.schedule(CRON_SCHEDULE, () => {
    runWorkflow();
  }, {
    timezone: 'UTC', // schedule is already expressed in UTC via CRON_SCHEDULE
  });
}
