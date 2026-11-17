/**
 * HVAC Lead Generation — Southwest Michigan
 *
 * Searches Apollo.io for HVAC owner contacts, deduplicates against an existing
 * Google Sheet, and appends up to MAX_LEADS_PER_RUN new rows each run.
 *
 * Scheduled: 7:00 AM Eastern Time daily via node-cron.
 * First-run verification: node index.js --test
 */

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const fs = require('fs');

// ─── Configuration ────────────────────────────────────────────────────────────

// Cities and zip-code keywords used to bias Apollo's location search.
// Add or remove cities here — Apollo does fuzzy location matching.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  'Southwest Michigan',
];

// Job titles in priority order. Apollo returns results sorted by its own
// relevance score; we re-sort locally to prefer Owner > President > Founder…
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Keywords sent to Apollo to narrow results to HVAC/mechanical trades.
// Apollo searches these against company name, description, and industry tags.
const INDUSTRY_KEYWORDS = 'HVAC heating cooling air conditioning mechanical contractor plumbing';

// Company size filter: 1–25 employees (owner-operated small businesses).
const EMPLOYEE_RANGE = '1,25';

// Max new contacts to add per scheduled run.
const MAX_LEADS_PER_RUN = 25;

// Google Sheet column layout (1-indexed, matches the header row order).
const SHEET_COLUMNS = {
  DATE_ADDED: 0,
  BUSINESS_NAME: 1,
  FIRST_NAME: 2,
  LAST_NAME: 3,
  PHONE: 4,
  CITY: 5,
  WEBSITE: 6,
  CALLED: 7,
  NOTES: 8,
};

const SHEET_HEADER = [
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

// ─── Apollo.io search ─────────────────────────────────────────────────────────

/**
 * Searches Apollo.io for HVAC contacts in SW Michigan.
 * Returns an array of raw Apollo people objects.
 */
async function fetchApolloLeads(page = 1) {
  const url = 'https://api.apollo.io/v1/mixed_people/search';

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    page,
    per_page: 50, // fetch more than needed so we have headroom after dedup
    person_titles: TARGET_TITLES,
    q_person_locations: SW_MICHIGAN_LOCATIONS,
    organization_num_employees_ranges: [EMPLOYEE_RANGE],
    q_organization_keywords: INDUSTRY_KEYWORDS,
  };

  const resp = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  if (resp.data && resp.data.people) {
    return resp.data.people;
  }

  throw new Error(`Unexpected Apollo response shape: ${JSON.stringify(resp.data).slice(0, 300)}`);
}

/**
 * Extracts the best available phone number from an Apollo person object.
 * Prefers direct/mobile numbers over HQ lines.
 */
function extractPhone(person) {
  // Apollo stores phone data in sanitized_phone and phone_numbers array
  if (person.sanitized_phone) return person.sanitized_phone;

  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    // Prefer mobile/direct over other types
    const preferred = person.phone_numbers.find(
      (p) => p.type === 'mobile' || p.type === 'direct'
    );
    return preferred ? preferred.sanitized_number : person.phone_numbers[0].sanitized_number;
  }

  return null;
}

/**
 * Maps a raw Apollo person object to our spreadsheet row format.
 * Returns null if the contact has no usable phone number (skip per requirement).
 */
function mapPersonToRow(person) {
  const phone = extractPhone(person);
  if (!phone) return null;

  const org = person.organization || {};
  const dateAdded = new Date().toLocaleDateString('en-US');

  // Try to extract a recognisable SW Michigan city from the person's location string.
  const locationStr = person.city || person.location_city || org.city || '';
  const city = locationStr || '';

  const website = org.website_url || org.primary_domain ? `https://${org.primary_domain}` : '';

  return [
    dateAdded,              // A: Date Added
    org.name || '',         // B: Business Name
    person.first_name || '', // C: Owner First Name
    person.last_name || '', // D: Owner Last Name
    phone,                  // E: Phone Number
    city,                   // F: City
    website,                // G: Website
    '',                     // H: Called (blank)
    '',                     // I: Notes (blank)
  ];
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

/**
 * Authenticates with Google using a service account JSON key file.
 * Returns an authorised google-auth-library client.
 */
function getGoogleAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error(
      `Google credentials file not found at: ${keyPath}\n` +
      `Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH in your .env file.`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

/**
 * Returns all values in the Business Name column (column B) of the sheet.
 * Used to check for duplicates before inserting.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!B2:B', // skip header row
  });

  const rows = resp.data.values || [];
  // Normalize to lowercase for case-insensitive comparison
  return new Set(rows.flat().map((name) => name.toLowerCase().trim()));
}

/**
 * Ensures the spreadsheet has the correct header row in row 1.
 * Safe to call on every run — it only writes if the header is missing or wrong.
 */
async function ensureHeaderRow(sheets, spreadsheetId) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A1:I1',
  });

  const existing = (resp.data.values || [[]])[0];
  const matches =
    existing.length === SHEET_HEADER.length &&
    existing.every((v, i) => v === SHEET_HEADER[i]);

  if (!matches) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1:I1',
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_HEADER] },
    });
    console.log('[Sheets] Header row written.');
  }
}

/**
 * Appends an array of rows to the bottom of Sheet1.
 */
async function appendRows(sheets, spreadsheetId, rows) {
  if (rows.length === 0) return;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:I',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Main workflow ─────────────────────────────────────────────────────────────

async function runLeadGen() {
  const startTime = new Date().toISOString();
  console.log(`\n[${startTime}] ─── Starting HVAC lead gen run ───`);

  // Validate required env vars before making any API calls
  const missing = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH'].filter(
    (k) => !process.env[k]
  );
  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    console.error('[ERROR]', msg);
    logError(msg);
    return;
  }

  let apolloPeople = [];
  let newRowsAdded = 0;

  // ── Step 1: fetch leads from Apollo ───────────────────────────────────────
  try {
    console.log('[Apollo] Searching for HVAC contacts in SW Michigan…');
    apolloPeople = await fetchApolloLeads(1);
    console.log(`[Apollo] Received ${apolloPeople.length} raw result(s).`);
  } catch (err) {
    const msg = `Apollo API error: ${err.response?.data?.message || err.message}`;
    console.error('[ERROR]', msg);
    logError(msg);
    return;
  }

  if (apolloPeople.length === 0) {
    const msg = 'Apollo returned 0 results. Check your API key and search filters.';
    console.warn('[WARN]', msg);
    logError(msg);
    return;
  }

  // ── Step 2: map to row format, drop contacts without phone numbers ─────────
  const candidateRows = apolloPeople
    .map(mapPersonToRow)
    .filter(Boolean); // null entries had no phone

  console.log(`[Filter] ${candidateRows.length} contacts have a phone number.`);

  if (candidateRows.length === 0) {
    const msg = 'No Apollo contacts had a usable phone number. Check Apollo credits/enrichment.';
    console.warn('[WARN]', msg);
    logError(msg);
    return;
  }

  // ── Step 3: sort by title priority ────────────────────────────────────────
  // Apollo returns its own ordering; re-sort so Owners come first.
  // Note: title isn't in our row array, so we sort the raw people in parallel.
  const titledCandidates = apolloPeople
    .map((person, i) => ({
      person,
      row: mapPersonToRow(person),
      titlePriority: TARGET_TITLES.findIndex(
        (t) => (person.title || '').toLowerCase().includes(t.toLowerCase())
      ),
    }))
    .filter((c) => c.row !== null)
    .sort((a, b) => {
      const pa = a.titlePriority === -1 ? TARGET_TITLES.length : a.titlePriority;
      const pb = b.titlePriority === -1 ? TARGET_TITLES.length : b.titlePriority;
      return pa - pb;
    });

  // ── Step 4: connect to Google Sheets and deduplicate ──────────────────────
  let sheets;
  let existingNames;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  try {
    const auth = getGoogleAuth();
    sheets = google.sheets({ version: 'v4', auth });
    await ensureHeaderRow(sheets, spreadsheetId);
    existingNames = await getExistingBusinessNames(sheets, spreadsheetId);
    console.log(`[Sheets] ${existingNames.size} existing business(es) in sheet.`);
  } catch (err) {
    const msg = `Google Sheets error: ${err.message}`;
    console.error('[ERROR]', msg);
    logError(msg);
    return;
  }

  // ── Step 5: filter duplicates and cap at MAX_LEADS_PER_RUN ───────────────
  const rowsToAdd = [];
  for (const { row } of titledCandidates) {
    if (rowsToAdd.length >= MAX_LEADS_PER_RUN) break;

    const businessName = (row[SHEET_COLUMNS.BUSINESS_NAME] || '').toLowerCase().trim();
    if (!businessName) continue; // skip blank company names

    if (existingNames.has(businessName)) {
      console.log(`[Dedup] Skipping duplicate: ${row[SHEET_COLUMNS.BUSINESS_NAME]}`);
      continue;
    }

    rowsToAdd.push(row);
    existingNames.add(businessName); // prevent intra-run duplicates too
  }

  console.log(`[Dedup] ${rowsToAdd.length} new unique lead(s) to add.`);

  // ── Step 6: append rows ───────────────────────────────────────────────────
  if (rowsToAdd.length > 0) {
    try {
      await appendRows(sheets, spreadsheetId, rowsToAdd);
      newRowsAdded = rowsToAdd.length;
      console.log(`[Sheets] ✓ Appended ${newRowsAdded} row(s) to sheet.`);
      rowsToAdd.forEach((r) =>
        console.log(`  → ${r[SHEET_COLUMNS.BUSINESS_NAME]} | ${r[SHEET_COLUMNS.PHONE]} | ${r[SHEET_COLUMNS.CITY]}`)
      );
    } catch (err) {
      const msg = `Failed to write rows to Google Sheets: ${err.message}`;
      console.error('[ERROR]', msg);
      logError(msg);
      return;
    }
  } else {
    console.log('[Run] No new leads to add this run (all were duplicates or over limit).');
  }

  const endTime = new Date().toISOString();
  console.log(`[${endTime}] ─── Run complete: ${newRowsAdded} lead(s) added ───\n`);
}

// ─── Error logging ─────────────────────────────────────────────────────────────

/**
 * Appends an error entry to errors.log with a timestamp.
 * In a future iteration, this can also send an email via nodemailer.
 */
function logError(message) {
  const entry = `[${new Date().toISOString()}] ERROR: ${message}\n`;
  fs.appendFileSync('errors.log', entry);
  console.error('[Logged to errors.log]');
  // TODO: wire up email alerting here with nodemailer if desired:
  // sendAlertEmail(message);
}

// ─── Connection test (--test flag) ─────────────────────────────────────────────

async function runConnectionTest() {
  console.log('\n══════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Test Mode');
  console.log('══════════════════════════════════════════\n');

  let apolloOk = false;
  let sheetsOk = false;

  // Test Apollo
  console.log('1) Testing Apollo.io API…');
  try {
    if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set in .env');
    const people = await fetchApolloLeads(1);
    console.log(`   ✓ Apollo connected — ${people.length} result(s) returned for search filters.`);
    apolloOk = true;
  } catch (err) {
    console.error(`   ✗ Apollo FAILED: ${err.response?.data?.message || err.message}`);
  }

  // Test Google Sheets
  console.log('\n2) Testing Google Sheets connection…');
  try {
    if (!process.env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set in .env');
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureHeaderRow(sheets, process.env.GOOGLE_SHEET_ID);
    const existing = await getExistingBusinessNames(sheets, process.env.GOOGLE_SHEET_ID);
    console.log(`   ✓ Google Sheets connected — sheet has ${existing.size} existing business(es).`);
    sheetsOk = true;
  } catch (err) {
    console.error(`   ✗ Google Sheets FAILED: ${err.message}`);
  }

  console.log('\n══════════════════════════════════════════');
  if (apolloOk && sheetsOk) {
    console.log('  ✓ All connections OK — ready to run.\n');
    console.log('  Start the scheduler:  npm start');
    console.log('  Or run once now:      node -e "require(\'./index.js\')" (remove cron line first)');
  } else {
    console.log('  ✗ One or more connections failed — fix errors above before running.\n');
  }
  console.log('══════════════════════════════════════════\n');
}

// ─── Entry point ───────────────────────────────────────────────────────────────

if (process.argv.includes('--test')) {
  runConnectionTest().catch(console.error);
} else {
  // Run once immediately on start so you can verify it works without waiting for 7am.
  runLeadGen().catch((err) => {
    console.error('[FATAL]', err.message);
    logError(`Uncaught error in runLeadGen: ${err.message}`);
  });

  // Schedule: 7:00 AM Eastern Time (UTC-5 standard / UTC-4 daylight).
  // "0 12 * * *" = 12:00 UTC = 7 AM ET (standard time).
  // If your server uses a different timezone, adjust the UTC offset here,
  // or set TZ=America/New_York in your environment and use "0 7 * * *".
  const cronExpression =
    process.env.TZ === 'America/New_York' ? '0 7 * * *' : '0 12 * * *';

  console.log(`[Scheduler] Cron scheduled: "${cronExpression}" — next run at 7:00 AM ET daily.`);

  cron.schedule(cronExpression, () => {
    runLeadGen().catch((err) => {
      console.error('[FATAL]', err.message);
      logError(`Uncaught error in runLeadGen: ${err.message}`);
    });
  });

  console.log('[Scheduler] Running. Keep this process alive (use pm2 or screen).\n');
}
