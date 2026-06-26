'use strict';

require('dotenv').config();

const cron       = require('node-cron');
const axios      = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const path       = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// Edit these arrays/values to change targets without touching the logic below.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Southwest Michigan cities to include in the person-location filter.
  // Apollo matches against the person's listed city, so include common
  // spellings and nearby ZIP-adjacent towns as needed.
  cities: [
    'St. Joseph, Michigan',
    'Saint Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
    'Stevensville, Michigan',
    'Coloma, Michigan',
    'Watervliet, Michigan',
    'Portage, Michigan',
  ],

  // Apollo keyword tags that match HVAC / plumbing / mechanical industries.
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'heating ventilation air conditioning',
    'plumbing',
    'plumbing and heating',
    'mechanical contracting',
    'air conditioning',
    'furnace',
    'refrigeration',
  ],

  // NAICS code 238220 = Plumbing, Heating & Air-Conditioning Contractors.
  // Apollo uses this as a fallback industry signal when keyword tags are sparse.
  naicsCodes: ['238220', '23822'],

  // Decision-maker titles in priority order.
  // Apollo will return people matching ANY of these.
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Company size: 1–25 employees (owner-operated small businesses).
  employeeRange: '1,25',

  // Maximum new leads to add per scheduled run.
  maxLeadsPerRun: 25,

  // The Google Spreadsheet to append results into.
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,

  // Name of the sheet tab (the default tab is "Sheet1"; rename it or update this).
  sheetName: 'Sheet1',

  // Email address that receives error alerts.
  alertEmail: process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com',
};

// ─────────────────────────────────────────────────────────────────────────────
// APOLLO.IO — people search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query Apollo's mixed_people/search endpoint for HVAC decision-makers
 * in Southwest Michigan, then filter to contacts that have a phone number.
 *
 * @returns {Promise<Array>} Array of lead objects ready to write to Sheets.
 */
async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  // Request more than maxLeadsPerRun from Apollo because some results will be
  // dropped (no phone number, blank business name, etc.).
  const fetchCount = Math.min(CONFIG.maxLeadsPerRun * 3, 100);

  const payload = {
    api_key: apiKey,

    // Person location filter — targets the specific SW Michigan cities.
    person_locations: CONFIG.cities,

    // Org location as a secondary net for contacts whose personal location
    // is listed as generic "Michigan" but whose employer is local.
    organization_locations: ['Michigan, United States'],

    // Title filter — no fuzzy matching so we stay in priority order.
    person_titles: CONFIG.targetTitles,
    include_similar_titles: false,

    // Seniority filter reinforces the title list.
    person_seniorities: ['owner', 'founder', 'c_suite'],

    // Company size 1–25 employees.
    organization_num_employees_ranges: [CONFIG.employeeRange],

    // Industry keyword tags.
    q_organization_keyword_tags: CONFIG.industryKeywords,

    // NAICS code filter for Plumbing, Heating & Air-Conditioning.
    organization_naics_codes: CONFIG.naicsCodes,

    per_page: fetchCount,
    page: 1,
  };

  console.log('[Apollo] Querying people search endpoint...');
  console.log(`[Apollo] Requesting up to ${fetchCount} candidates to find ${CONFIG.maxLeadsPerRun} leads with phone numbers`);

  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const people = response.data?.people ?? [];
  const pagination = response.data?.pagination ?? {};
  console.log(`[Apollo] API returned ${people.length} people (total matching: ${pagination.total_entries ?? 'unknown'})`);

  // Map API results to a clean lead object, skipping contacts with no phone.
  const leads = [];

  for (const person of people) {
    if (leads.length >= CONFIG.maxLeadsPerRun) break;

    const phone = pickBestPhone(person.phone_numbers ?? []);
    if (!phone) continue;

    const businessName = (
      person.organization?.name ||
      person.organization_name ||
      ''
    ).trim();
    if (!businessName) continue;

    const city = (
      person.city ||
      person.organization?.city ||
      extractCity(person.present_raw_address)
    ).trim();

    leads.push({
      businessName,
      firstName:  (person.first_name  || '').trim(),
      lastName:   (person.last_name   || '').trim(),
      phone,
      city,
      website:    (person.organization?.website_url || person.website_url || '').trim(),
    });
  }

  console.log(`[Apollo] ${leads.length} usable leads after filtering for phone number`);
  return leads;
}

/**
 * Pick the best phone from Apollo's phone_numbers array.
 * Priority: mobile → direct → work_hq → any available number.
 */
function pickBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return null;

  const priority = ['mobile', 'direct_phone', 'direct', 'work_hq', 'other'];
  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fall back to any number with a sanitized value.
  const fallback = phoneNumbers.find(p => p.sanitized_number);
  return fallback ? fallback.sanitized_number : null;
}

/** Pull the first segment (city) from a raw address string. */
function extractCity(raw) {
  if (!raw) return '';
  return raw.split(',')[0].trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS — read existing rows, append new leads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an authenticated Google Sheets client.
 * Supports service-account key file or inline JSON (see .env.example).
 */
function buildSheetsClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  let auth;

  if (keyPath) {
    auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyPath),
      scopes:  ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else if (keyJson) {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(keyJson),
      scopes:      ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or ' +
      'GOOGLE_SERVICE_ACCOUNT_JSON in your .env file.'
    );
  }

  return google.sheets({ version: 'v4', auth });
}

/**
 * Write the header row if the sheet is empty.
 * Column order: Date Added | Business Name | Owner First Name | Owner Last Name
 *               | Phone Number | City | Website | Called | Notes
 */
async function ensureHeaders(sheets) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range:         `${CONFIG.sheetName}!A1:I1`,
  });

  if ((data.values?.[0] ?? []).length === 0) {
    console.log('[Sheets] Sheet is empty — writing header row...');
    await sheets.spreadsheets.values.update({
      spreadsheetId:    CONFIG.spreadsheetId,
      range:            `${CONFIG.sheetName}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Date Added',
          'Business Name',
          'Owner First Name',
          'Owner Last Name',
          'Phone Number',
          'City',
          'Website',
          'Called',
          'Notes',
        ]],
      },
    });
    console.log('[Sheets] Headers written.');
  }
}

/**
 * Read all existing Business Names (column B) from the sheet.
 * Returns a Set of lowercased, trimmed names for fast duplicate lookup.
 */
async function getExistingBusinessNames(sheets) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range:         `${CONFIG.sheetName}!B2:B`,   // Skip header row
  });

  const rows = data.values ?? [];
  return new Set(rows.flat().map(n => n.toLowerCase().trim()).filter(Boolean));
}

/**
 * Append new lead rows to the spreadsheet.
 * @returns {number} How many rows were appended.
 */
async function appendLeads(sheets, leads) {
  if (leads.length === 0) {
    console.log('[Sheets] No new rows to append.');
    return 0;
  }

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  });

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '',   // Called — left blank for manual tracking
    '',   // Notes  — left blank for manual tracking
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId:    CONFIG.spreadsheetId,
    range:            `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new leads.`);
  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an error alert email via Gmail SMTP.
 * If SMTP credentials are not configured the error is logged to console only.
 */
async function sendErrorAlert(subject, detail) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // Always log to console regardless of email config.
  console.error(`\n[ALERT] ${subject}\n${detail}\n`);

  if (!smtpUser || !smtpPass) {
    console.warn('[Alert] SMTP not configured — email alert skipped. Set SMTP_USER and SMTP_PASS to enable.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth:    { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from:    smtpUser,
      to:      CONFIG.alertEmail,
      subject: `[HVAC Lead Gen] ${subject}`,
      text:    [
        'The HVAC lead generation workflow encountered an issue:',
        '',
        detail,
        '',
        `Timestamp: ${new Date().toISOString()}`,
        `Spreadsheet: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit`,
      ].join('\n'),
    });

    console.log(`[Alert] Notification sent to ${CONFIG.alertEmail}`);
  } catch (emailErr) {
    console.error('[Alert] Failed to send email notification:', emailErr.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

async function runLeadGenWorkflow() {
  const startTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log('\n══════════════════════════════════════════');
  console.log(` HVAC Lead Gen — ${startTime} ET`);
  console.log('══════════════════════════════════════════');

  // ── Step 1: Apollo search ──────────────────────────────────────────────
  let leads;
  try {
    leads = await searchApolloLeads();
  } catch (err) {
    await sendErrorAlert(
      'Apollo Search Failed',
      `Apollo.io search returned an error:\n${err.message}\n\n` +
      'Check your APOLLO_API_KEY and API plan limits.'
    );
    return;
  }

  if (leads.length === 0) {
    await sendErrorAlert(
      'No Leads Returned',
      'Apollo returned results but none had a phone number matching the filters.\n\n' +
      'Possible causes:\n' +
      '• Your Apollo plan may not include phone data for this region\n' +
      '• The industry keyword / location combination yielded no matches\n' +
      '• All matching contacts have already been added to the sheet\n\n' +
      'No changes were made to the spreadsheet.'
    );
    return;
  }

  // ── Step 2: Connect to Google Sheets ──────────────────────────────────
  let sheets;
  try {
    sheets = buildSheetsClient();
    await ensureHeaders(sheets);
  } catch (err) {
    await sendErrorAlert(
      'Google Sheets Connection Failed',
      `Could not connect to Google Sheets:\n${err.message}\n\n` +
      'Check your service account credentials and that the sheet is shared with the service account.'
    );
    return;
  }

  // ── Step 3: Read existing entries for dedup ────────────────────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`[Dedup] ${existingNames.size} businesses already in the sheet`);
  } catch (err) {
    await sendErrorAlert(
      'Google Sheets Read Failed',
      `Failed to read existing sheet data:\n${err.message}`
    );
    return;
  }

  // ── Step 4: Remove duplicates ──────────────────────────────────────────
  const newLeads = leads.filter(lead => {
    const key = lead.businessName.toLowerCase().trim();
    return key.length > 0 && !existingNames.has(key);
  });

  const skipped = leads.length - newLeads.length;
  if (skipped > 0) console.log(`[Dedup] Skipped ${skipped} duplicate(s)`);

  if (newLeads.length === 0) {
    console.log('[Run] All leads from this batch are already in the sheet — nothing to add.');
    return;
  }

  // ── Step 5: Write to spreadsheet ──────────────────────────────────────
  try {
    const added = await appendLeads(sheets, newLeads);
    console.log(`\n[Run] Complete — ${added} new lead(s) added.`);
    console.log(`      View: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit`);
  } catch (err) {
    await sendErrorAlert(
      'Google Sheets Write Failed',
      `Leads were fetched from Apollo but could not be written to the sheet:\n${err.message}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION VERIFICATION — run before starting the scheduler
// ─────────────────────────────────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n══════════════════════════════════════════');
  console.log(' Pre-flight Connection Check');
  console.log('══════════════════════════════════════════\n');

  let allGood = true;

  // ── Check Apollo ───────────────────────────────────────────────────────
  process.stdout.write('[1/2] Apollo.io ... ');
  try {
    // A minimal search (1 result) confirms the key is valid without burning credits.
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { api_key: process.env.APOLLO_API_KEY, per_page: 1, page: 1 },
      { timeout: 15_000 }
    );
    const status = res.data?.people !== undefined ? 'CONNECTED' : 'UNEXPECTED RESPONSE';
    console.log(`✓ ${status}`);
    if (res.data?.rate_limit_remaining !== undefined) {
      console.log(`   Rate limit remaining: ${res.data.rate_limit_remaining}`);
    }
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    console.log(`✗ FAILED\n   ${detail}`);
    allGood = false;
  }

  // ── Check Google Sheets ────────────────────────────────────────────────
  process.stdout.write('[2/2] Google Sheets ... ');
  try {
    const sheets = buildSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: CONFIG.spreadsheetId,
      fields:        'spreadsheetId,properties.title',
    });
    const title = res.data?.properties?.title ?? CONFIG.spreadsheetId;
    console.log(`✓ CONNECTED  ("${title}")`);
  } catch (err) {
    console.log(`✗ FAILED\n   ${err.message}`);
    allGood = false;
  }

  console.log('\n══════════════════════════════════════════');
  if (allGood) {
    console.log(' All systems go. Starting scheduler.');
  } else {
    console.log(' One or more connections FAILED.');
    console.log(' Fix the errors above, then restart.');
  }
  console.log('══════════════════════════════════════════\n');

  return allGood;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // --verify-only: check connections and exit (used by `npm run verify`)
  if (args.includes('--verify-only')) {
    const ok = await verifyConnections();
    process.exit(ok ? 0 : 1);
  }

  // Always verify connections before scheduling.
  const connectionsOk = await verifyConnections();
  if (!connectionsOk) process.exit(1);

  // --run-now: execute one immediate run then exit (used by `npm run run-now`)
  if (args.includes('--run-now')) {
    await runLeadGenWorkflow();
    return;
  }

  // Default: schedule at 7:00 AM Eastern Time every day.
  // node-cron's timezone option handles EST/EDT automatically.
  console.log('[Scheduler] Job scheduled: 7:00 AM Eastern Time, every day');
  console.log('[Scheduler] Process will stay alive and wait for next run...\n');

  cron.schedule(
    '0 7 * * *',
    () => runLeadGenWorkflow().catch(err => console.error('[Scheduler] Unhandled error:', err.message)),
    { timezone: 'America/New_York' }
  );
}

main().catch(err => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
