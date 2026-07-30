/**
 * HVAC Lead Generation Workflow
 *
 * Searches Apollo.io for HVAC / plumbing / mechanical business owners
 * in Southwest Michigan, deduplicates against Google Sheets, and appends
 * up to MAX_LEADS_PER_RUN new rows per execution.
 *
 * Scheduler: Daily at 7:00 AM Eastern Time (handles DST automatically).
 *
 * Usage:
 *   node lead-workflow.js               → start scheduler (runs at 7am ET daily)
 *   node lead-workflow.js --run-now     → run immediately (test / first-run mode)
 *
 * Required environment variables (see .env.example):
 *   APOLLO_API_KEY          - Your Apollo.io API key
 *   GOOGLE_SHEET_ID         - The Google Spreadsheet ID from the URL
 *   GOOGLE_CREDENTIALS_PATH - Path to your Google service-account JSON file
 *                             (defaults to ./credentials.json)
 *
 * Optional environment variables for email error alerts:
 *   NOTIFICATION_EMAIL      - Where to send alerts
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */

'use strict';

require('dotenv').config();

const axios      = require('axios');
const { google } = require('googleapis');
const cron       = require('node-cron');
const fs         = require('fs');

// ─── SEARCH CONFIG ────────────────────────────────────────────────────────────
// Edit these arrays to change geography, niche, or title priority.

const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

const TARGET_INDUSTRIES = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating',
  'cooling',
  'air conditioning',
];

// Titles listed in priority order; Apollo will return matches for any of them.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// 1–25 employees only (owner-operated small businesses)
const EMPLOYEE_RANGES = ['1,10', '11,25'];

// Maximum leads appended per scheduled run
const MAX_LEADS_PER_RUN = 25;

// ─── COLUMN LAYOUT ────────────────────────────────────────────────────────────
// To reorder or rename columns, edit this array only — everything else adapts.
// 'key'    → property name used internally in lead objects
// 'header' → column label written to the spreadsheet header row

const COLUMNS = [
  { key: 'dateAdded',    header: 'Date Added'       },
  { key: 'businessName', header: 'Business Name'    },
  { key: 'firstName',    header: 'Owner First Name' },
  { key: 'lastName',     header: 'Owner Last Name'  },
  { key: 'phone',        header: 'Phone Number'     },
  { key: 'city',         header: 'City'             },
  { key: 'website',      header: 'Website'          },
  { key: 'called',       header: 'Called'           },
  { key: 'notes',        header: 'Notes'            },
];

// ─── APOLLO.IO ────────────────────────────────────────────────────────────────

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Search Apollo's people database for matching contacts.
 * Returns an array of person objects (last names may be masked on some plans).
 * Requires Apollo Basic plan or above for this endpoint.
 */
async function searchApolloLeads() {
  const locationQueries = TARGET_CITIES.map(city => `${city}, Michigan`);

  const { data } = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    {
      api_key:                       process.env.APOLLO_API_KEY,
      page:                          1,
      per_page:                      MAX_LEADS_PER_RUN * 3, // over-fetch to survive dedup
      person_titles:                 TARGET_TITLES,
      person_seniorities:            ['owner', 'c_suite', 'founder'],
      person_locations:              locationQueries,
      organization_locations:        ['Michigan, United States'],
      q_organization_keyword_tags:   TARGET_INDUSTRIES,
      organization_num_employees_ranges: EMPLOYEE_RANGES,
      include_similar_titles:        true,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    }
  );

  return data.people || [];
}

/**
 * Enrich a single person by Apollo ID to reveal phone numbers.
 * Each enrichment consumes 1 Apollo credit on paid plans.
 */
async function enrichPerson(apolloId) {
  const { data } = await axios.post(
    `${APOLLO_BASE}/people/match`,
    {
      api_key:                process.env.APOLLO_API_KEY,
      id:                     apolloId,
      reveal_personal_emails: false,
      reveal_phone_number:    true,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    }
  );

  return data.person || null;
}

// ─── GOOGLE SHEETS ────────────────────────────────────────────────────────────

function buildSheetsClient() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at "${credPath}". ` +
      'Set GOOGLE_CREDENTIALS_PATH or place credentials.json in this directory.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Write the header row if the sheet is still empty.
 */
async function ensureHeaders(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A1:Z1',
  });

  const firstRow = (res.data.values || [])[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS.map(c => c.header)] },
    });
    console.log('  Header row written to sheet.');
  }
}

/**
 * Return a Set of existing business names (lowercased) from column B.
 * Used to skip duplicates before inserting.
 */
async function loadExistingNames(sheets, spreadsheetId) {
  // Business Name is the second column (index 1 → letter B)
  const bizColIndex  = COLUMNS.findIndex(c => c.key === 'businessName');
  const colLetter    = String.fromCharCode(65 + bizColIndex);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Sheet1!${colLetter}2:${colLetter}50000`, // row 2+ skips header
  });

  const names = new Set(
    (res.data.values || []).map(r => (r[0] || '').trim().toLowerCase())
  );

  return names;
}

/**
 * Append an array of lead objects to the sheet.
 * Returns the number of rows written.
 */
async function appendLeads(sheets, spreadsheetId, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
  });

  const rows = leads.map(lead =>
    COLUMNS.map(col => {
      if (col.key === 'dateAdded')               return today;
      if (col.key === 'called' || col.key === 'notes') return '';
      return lead[col.key] || '';
    })
  );

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:           'Sheet1!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: rows },
  });

  return rows.length;
}

// ─── ERROR NOTIFICATIONS ──────────────────────────────────────────────────────

/**
 * Send an email alert when the workflow encounters an error.
 * Falls back to console logging if SMTP is not configured.
 */
async function sendErrorAlert(subject, body) {
  console.error(`\n[ERROR] ${subject}\n${body}\n`);

  const to = process.env.NOTIFICATION_EMAIL;
  if (!to || !process.env.SMTP_HOST) return; // SMTP not configured — console only

  try {
    const nodemailer = require('nodemailer');
    const transport  = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transport.sendMail({
      from:    process.env.SMTP_USER,
      to,
      subject: `[HVAC Lead Workflow] ${subject}`,
      text:    body,
    });

    console.log(`  Alert email sent to ${to}`);
  } catch (emailErr) {
    console.error('  Failed to send alert email:', emailErr.message);
  }
}

// ─── CORE WORKFLOW ────────────────────────────────────────────────────────────

async function runWorkflow() {
  const timestamp = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${timestamp}] Starting HVAC Lead Workflow`);
  console.log(`${'─'.repeat(60)}`);

  // ── Guard: required env vars ──────────────────────────────
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not set. Add it to your .env file.');
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  // ── Connect to Google Sheets ──────────────────────────────
  let sheets;
  try {
    sheets = buildSheetsClient();
    console.log('✓ Google Sheets client initialized.');
  } catch (err) {
    await sendErrorAlert('Google Sheets Init Failed', err.message);
    return;
  }

  // ── Ensure header row exists ──────────────────────────────
  try {
    await ensureHeaders(sheets, spreadsheetId);
  } catch (err) {
    await sendErrorAlert('Cannot Access Google Sheet', err.message);
    return;
  }

  // ── Load existing names for dedup ─────────────────────────
  let existingNames;
  try {
    existingNames = await loadExistingNames(sheets, spreadsheetId);
    console.log(`✓ Loaded ${existingNames.size} existing business name(s) for dedup.`);
  } catch (err) {
    await sendErrorAlert('Google Sheets Read Failed', err.message);
    return;
  }

  // ── Search Apollo ─────────────────────────────────────────
  let candidates = [];
  try {
    candidates = await searchApolloLeads();
    console.log(`✓ Apollo returned ${candidates.length} candidate(s).`);
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    await sendErrorAlert('Apollo Search Failed', detail);
    return;
  }

  if (candidates.length === 0) {
    await sendErrorAlert(
      'Apollo Returned 0 Results',
      'The current filters produced no results. Check your Apollo plan, city list, and industry tags.'
    );
    return;
  }

  // ── Enrich + filter ───────────────────────────────────────
  const newLeads = [];
  console.log('\nProcessing candidates:');

  for (const person of candidates) {
    if (newLeads.length >= MAX_LEADS_PER_RUN) break;

    const rawName = (person.organization?.name || '').trim();
    const nameLower = rawName.toLowerCase();

    // Skip if already in sheet
    if (!rawName || existingNames.has(nameLower)) {
      console.log(`  – Skipping (duplicate or no company): ${rawName || 'unknown'}`);
      continue;
    }

    // Enrich to get phone number
    let enriched = person;
    try {
      const result = await enrichPerson(person.id);
      if (result) enriched = result;
    } catch (err) {
      // Non-fatal: continue with whatever data we have
      console.warn(`  ⚠ Could not enrich ${rawName}: ${err.message}`);
    }

    // Prefer mobile → direct → sanitized → first available
    const phone =
      enriched.mobile_phone ||
      enriched.direct_phone ||
      enriched.sanitized_phone ||
      enriched.phone_numbers?.[0]?.sanitized_number ||
      '';

    // Skip if no phone number found
    if (!phone) {
      console.log(`  – Skipping (no phone): ${rawName}`);
      continue;
    }

    const lead = {
      businessName: enriched.organization?.name || rawName,
      firstName:    enriched.first_name || '',
      lastName:     enriched.last_name  || '',
      phone,
      city:
        enriched.city ||
        enriched.present_city ||
        enriched.organization?.city ||
        '',
      website: enriched.organization?.website_url || '',
    };

    newLeads.push(lead);
    existingNames.add(nameLower); // prevent intra-batch duplicates
    console.log(
      `  + ${lead.businessName} | ${lead.firstName} ${lead.lastName} | ${lead.phone} | ${lead.city}`
    );
  }

  console.log(`\n${newLeads.length} new lead(s) to append.`);

  if (newLeads.length === 0) {
    console.log('Nothing to write — all candidates were duplicates or had no phone.');
    return;
  }

  // ── Write to sheet ────────────────────────────────────────
  try {
    const written = await appendLeads(sheets, spreadsheetId, newLeads);
    console.log(`✓ Appended ${written} row(s) to Google Sheet.`);
  } catch (err) {
    await sendErrorAlert('Google Sheets Write Failed', err.message);
    return;
  }

  console.log(`\n[${new Date().toISOString()}] Workflow complete.\n`);
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--run-now') || args.includes('--test')) {
    // Immediate run — useful for first-time setup and testing
    await runWorkflow().catch(err => {
      console.error('Fatal error:', err.message);
      process.exit(1);
    });
    return;
  }

  // ── Scheduled mode ────────────────────────────────────────
  // Cron: "0 7 * * *" = 7:00 AM; timezone option handles EST/EDT automatically.
  console.log('HVAC Lead Workflow — Scheduler started.');
  console.log('Will run every day at 7:00 AM Eastern Time.');
  console.log('To run immediately, use: node lead-workflow.js --run-now\n');

  cron.schedule(
    '0 7 * * *',
    async () => {
      try {
        await runWorkflow();
      } catch (err) {
        console.error('Unhandled workflow error:', err.message);
      }
    },
    { timezone: 'America/New_York' }
  );
}

main();
