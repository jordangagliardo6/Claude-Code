'use strict';

require('dotenv').config();
const axios   = require('axios');
const cron    = require('node-cron');
const { google } = require('googleapis');
const nodemailer  = require('nodemailer');

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIGURATION
//  Edit this section to change cities, lead limits, filters, or column layout.
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // ── Geography ──────────────────────────────────────────────────────────────
  // Apollo matches these against the person's reported location AND the
  // organization's HQ. Add or remove cities freely; format: "City, Michigan".
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // ── Run limits ─────────────────────────────────────────────────────────────
  maxLeadsPerRun: 25,

  // ── Apollo search filters ──────────────────────────────────────────────────
  apollo: {
    // SIC industry codes for HVAC / plumbing / mechanical trades:
    //   1711 = Plumbing, Heating, Air-Conditioning Contractors
    //   7623 = Refrigeration and Heating Equipment Repair
    //   5075 = Warm Air Heating & Air-Conditioning Equipment (wholesale)
    sicCodes: ['1711', '7623', '5075'],

    // NAICS codes as a secondary industry signal:
    //   238220 = Plumbing, Heating, and Air-Conditioning Contractors
    //   423720 = Plumbing and Heating Equipment Wholesalers
    naicsCodes: ['238220', '423720'],

    // Keyword tags on the organization record — catches companies not coded
    // under the SIC/NAICS codes above
    keywordTags: [
      'hvac',
      'heating and air conditioning',
      'plumbing',
      'mechanical contracting',
    ],

    // 1–25 employees = owner-operated small business
    employeeRange: '1,25',

    // Job titles in priority order (Owner has highest outreach value)
    titles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

    // Limit to senior / owner-level people
    seniorities: ['owner', 'c_suite'],
  },

  // ── Google Sheets ──────────────────────────────────────────────────────────
  sheets: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    // Name of the tab inside the spreadsheet
    sheetName: 'Leads',
  },

  // ── Error notifications ────────────────────────────────────────────────────
  notify: {
    to: process.env.NOTIFY_EMAIL || 'jgagliardo98@gmail.com',
  },
};

// Column headers written to the sheet on first run.
// IMPORTANT: if you add, remove, or reorder columns here, also update
// personToRow() below so the data lines up correctly.
const HEADERS = [
  'Date Added',        // A
  'Business Name',     // B  ← used for duplicate detection
  'Owner First Name',  // C
  'Owner Last Name',   // D
  'Phone Number',      // E
  'City',              // F
  'Website',           // G
  'Called',            // H  (left blank — fill in manually)
  'Notes',             // I  (left blank — fill in manually)
];


// ═══════════════════════════════════════════════════════════════════════════════
//  APOLLO.IO API
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchApolloLeads(page = 1) {
  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      api_key:                          process.env.APOLLO_API_KEY,
      person_titles:                    CONFIG.apollo.titles,
      person_seniorities:               CONFIG.apollo.seniorities,
      include_similar_titles:           true,
      // Broad state-level filter — narrows to Michigan while allowing Apollo
      // to match the smaller Southwest Michigan cities in person_locations
      organization_locations:           ['Michigan, United States'],
      // City-level filter biases results toward Southwest Michigan
      person_locations:                 CONFIG.cities,
      // Small-business headcount filter
      organization_num_employees_ranges: [CONFIG.apollo.employeeRange],
      // Primary industry filter via SIC codes
      organization_sic_codes:           CONFIG.apollo.sicCodes,
      // Secondary industry filter via NAICS codes
      organization_naics_codes:         CONFIG.apollo.naicsCodes,
      // Tertiary industry filter via keyword tags on the org record
      q_organization_keyword_tags:      CONFIG.apollo.keywordTags,
      // Fetch a buffer so we still have maxLeadsPerRun after dedup + phone filter
      per_page:                         100,
      page,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    }
  );

  return response.data;
}

// Returns the best available phone number from Apollo's phone_numbers array.
// Apollo provides phone type hints; we prioritize mobile/direct lines over
// main business lines because the owner is more likely to answer them.
function pickPhone(person) {
  const phones = (person.phone_numbers || []).filter(p => p.sanitized_number);
  if (!phones.length) return null;

  const priority = ['mobile', 'direct', 'work_hq', 'other'];
  for (const type of priority) {
    const match = phones.find(p => p.type === type);
    if (match) return match.sanitized_number;
  }

  return phones[0].sanitized_number;
}

// Extracts the most precise city string from a person record.
// Person-level city is preferred (actual home/work location);
// org raw_address is the fallback (HQ city).
function pickCity(person) {
  if (person.city) return person.city;
  const addr = person.organization?.raw_address || '';
  return addr.split(',')[0]?.trim() || '';
}

// Maps a single Apollo person object to a sheet row.
// The array order MUST match HEADERS above.
function personToRow(person, dateAdded) {
  return [
    dateAdded,
    (person.organization?.name   || '').trim(),  // Business Name
    (person.first_name           || '').trim(),  // Owner First Name
    (person.last_name            || '').trim(),  // Owner Last Name
    pickPhone(person)            || '',          // Phone Number
    pickCity(person),                            // City
    (
      person.organization?.website_url     ||
      person.organization?.primary_domain  ||
      ''
    ),                                           // Website
    '',                                          // Called  (manual)
    '',                                          // Notes   (manual)
  ];
}


// ═══════════════════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS
// ═══════════════════════════════════════════════════════════════════════════════

function buildSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Returns a Set<string> of lowercase business names already in the sheet.
// Used to prevent inserting duplicates.
async function getExistingBusinessNames(sheets) {
  const { spreadsheetId, sheetName } = CONFIG.sheets;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,  // Business Name column
  });

  const rows = res.data.values || [];
  // Skip the header row (index 0)
  return new Set(
    rows.slice(1)
        .map(r => (r[0] || '').toLowerCase().trim())
        .filter(Boolean)
  );
}

// Writes HEADERS to row 1 if the sheet is completely empty.
async function ensureHeaderRow(sheets) {
  const { spreadsheetId, sheetName } = CONFIG.sheets;
  const lastCol = String.fromCharCode(64 + HEADERS.length); // e.g. "I" for 9 cols
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:${lastCol}1`,
  });

  const firstRow = (res.data.values || [])[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody:      { values: [HEADERS] },
    });
    log('Column headers written to sheet.');
  }
}

// Appends rows below the last populated row, never overwriting existing data.
async function appendRows(sheets, rows) {
  const { spreadsheetId, sheetName } = CONFIG.sheets;
  const lastCol = String.fromCharCode(64 + HEADERS.length);
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:            `${sheetName}!A:${lastCol}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: rows },
  });
  return res.data.updates?.updatedRows ?? rows.length;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  ERROR NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Logs the error to the console and optionally sends an email if SMTP is
// configured.  Set SMTP_HOST / SMTP_USER / SMTP_PASS in .env to enable email.
async function notify(subject, detail) {
  const body = `${detail}\n\nTimestamp: ${new Date().toISOString()}`;
  log(`[ERROR] ${subject} — ${detail}`);

  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    log('[NOTIFY] SMTP not configured — email alert skipped.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || SMTP_USER,
      to:      CONFIG.notify.to,
      subject: `[Lead Gen] ${subject}`,
      text:    body,
    });
    log(`[NOTIFY] Error email sent to ${CONFIG.notify.to}`);
  } catch (emailErr) {
    log(`[NOTIFY] Failed to send email: ${emailErr.message}`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function runWorkflow() {
  const dateAdded = new Date().toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
  });

  log('─── Lead gen run started ───────────────────────────────────────');

  // Step 1 — Load existing business names for dedup
  let sheets, existingNames;
  try {
    sheets        = buildSheetsClient();
    existingNames = await getExistingBusinessNames(sheets);
    log(`Dedup: loaded ${existingNames.size} existing business names from sheet.`);
  } catch (err) {
    await notify('Google Sheets read failed', err.message);
    return;
  }

  // Step 2 — Search Apollo
  let rawPeople = [];
  try {
    const data = await fetchApolloLeads(1);
    rawPeople   = data.people || [];
    const total = data.pagination?.total_entries ?? '?';
    log(`Apollo: returned ${rawPeople.length} results (${total} total in database for this search).`);
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    await notify('Apollo API search failed', detail);
    return;
  }

  if (rawPeople.length === 0) {
    await notify(
      'Apollo returned 0 results',
      'The people search returned no records. Check your API key, industry filters, and location settings.'
    );
    return;
  }

  // Step 3 — Filter: phone required, business name required, no duplicates
  const newRows     = [];
  let   skippedPhone = 0;
  let   skippedDup   = 0;

  for (const person of rawPeople) {
    if (newRows.length >= CONFIG.maxLeadsPerRun) break;

    const phone   = pickPhone(person);
    const bizName = (person.organization?.name || '').trim();

    if (!phone)   { skippedPhone++; continue; }
    if (!bizName)             continue;

    if (existingNames.has(bizName.toLowerCase())) {
      skippedDup++;
      continue;
    }

    newRows.push(personToRow(person, dateAdded));
    // Track within-run to prevent inserting the same company twice if Apollo
    // returns multiple contacts from the same org
    existingNames.add(bizName.toLowerCase());
  }

  log(`Filter: ${newRows.length} new | ${skippedPhone} no-phone | ${skippedDup} duplicate`);

  if (newRows.length === 0) {
    log('No new leads to add — sheet is already up to date.');
    return;
  }

  // Step 4 — Write to Google Sheets
  try {
    await ensureHeaderRow(sheets);
    const added = await appendRows(sheets, newRows);
    log(`Sheets: ${added} new lead(s) appended successfully.`);
  } catch (err) {
    await notify('Google Sheets write failed', err.message);
    return;
  }

  log('─── Run complete ────────────────────────────────────────────────');
}


// ═══════════════════════════════════════════════════════════════════════════════
//  CONNECTIVITY VERIFICATION  (node index.js --verify)
//  Run this before your first scheduled run to confirm both APIs are reachable.
// ═══════════════════════════════════════════════════════════════════════════════

async function verifyConnections() {
  console.log('\n  Verifying connections...\n');
  let allOk = true;

  // ── Apollo ──
  process.stdout.write('  Apollo.io API .............. ');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { api_key: process.env.APOLLO_API_KEY, per_page: 1, page: 1 },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
    );
    const total = res.data?.pagination?.total_entries;
    console.log(`✓ OK  (${total ?? 'unknown'} total records accessible)`);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.log(`✗ FAIL  — ${msg}`);
    allOk = false;
  }

  // ── Google Sheets ──
  process.stdout.write('  Google Sheets API .......... ');
  try {
    const sheets = buildSheetsClient();
    const meta   = await sheets.spreadsheets.get({
      spreadsheetId: CONFIG.sheets.spreadsheetId,
    });
    const title = meta.data.properties?.title || '(unknown)';
    console.log(`✓ OK  (spreadsheet: "${title}")`);
  } catch (err) {
    console.log(`✗ FAIL  — ${err.message}`);
    allOk = false;
  }

  // ── SMTP (optional) ──
  const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  process.stdout.write('  SMTP (email alerts) ........ ');
  if (!smtpConfigured) {
    console.log('— SKIPPED  (no SMTP config — set SMTP_HOST/USER/PASS to enable)');
  } else {
    try {
      const t = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await t.verify();
      console.log('✓ OK');
    } catch (err) {
      console.log(`✗ FAIL  — ${err.message}`);
      // SMTP failure is a warning, not a blocker
    }
  }

  console.log();
  if (allOk) {
    console.log('  ✓ All required connections verified.\n');
    console.log('  Next steps:');
    console.log('    npm run run-now    → run once immediately to confirm leads flow into the sheet');
    console.log('    npm start          → start the scheduler (7:00 AM ET daily)\n');
  } else {
    console.log('  ✗ One or more required connections failed. Fix the issues above before starting.\n');
    process.exit(1);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  // Abort early if required env vars are missing
  const required = [
    'APOLLO_API_KEY',
    'GOOGLE_SPREADSHEET_ID',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\nMissing required environment variables:\n`);
    missing.forEach(k => console.error(`  ${k}`));
    console.error('\nCopy .env.example → .env and fill in your credentials.\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.includes('--verify')) {
    return verifyConnections();
  }

  if (args.includes('--run-now')) {
    return runWorkflow();
  }

  // Default mode: start the daily cron scheduler.
  // node-cron respects the TZ environment variable — the npm start script
  // sets TZ=America/New_York so "0 7 * * *" always means 7:00 AM ET regardless
  // of where the server is physically located.
  cron.schedule('0 7 * * *', runWorkflow, { timezone: 'America/New_York' });

  log('Scheduler started — next run at 7:00 AM ET.');
  log('Tip: run  npm run verify  first if you haven\'t confirmed connectivity yet.');
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
