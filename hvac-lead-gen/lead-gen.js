/**
 * hvac-lead-gen/lead-gen.js
 *
 * Daily Apollo.io → Google Sheets lead pipeline.
 * Searches for HVAC / plumbing / mechanical decision-makers in SW Michigan,
 * deduplicates against the sheet, appends up to MAX_LEADS_PER_RUN new rows,
 * and emails you on any failure.
 *
 * Schedule: every day at 7:00 AM Eastern Time (America/New_York)
 *
 * Usage:
 *   node lead-gen.js              → starts the cron daemon
 *   node lead-gen.js --run-now   → fires one immediate run, then exits
 */

'use strict';

require('dotenv').config();
const axios      = require('axios');
const cron       = require('node-cron');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');
const readline   = require('readline');

// ─── Config ──────────────────────────────────────────────────────────────────

const APOLLO_API_KEY    = process.env.APOLLO_API_KEY;
const SHEET_ID          = process.env.GOOGLE_SHEET_ID || '1i2wPT9RFCoNTN1_sT2gfJ6yaONTQeudLFg7CAvASFd8';
const SHEET_TAB         = process.env.SHEET_TAB_NAME  || 'Sheet1';
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;
const MAX_LEADS         = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// Google OAuth token file — created automatically by setup.js
const TOKEN_PATH       = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Spreadsheet column layout (A=0, B=1 … I=8)
const COLUMNS = {
  DATE_ADDED:  'A',
  BIZ_NAME:    'B',
  FIRST_NAME:  'C',
  LAST_NAME:   'D',
  PHONE:       'E',
  CITY:        'F',
  WEBSITE:     'G',
  CALLED:      'H',  // left blank — you fill this in manually
  NOTES:       'I',  // left blank
};

const SHEET_HEADERS = [
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

// ─── Search targets — easy to extend ─────────────────────────────────────────

// To add more cities, just push to this array. The script rebuilds the query automatically.
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Priority order — Apollo returns results ranked, but we request titles in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors
// SIC  1711    = Plumbing, Heating & Air-Conditioning (fallback)
const NAICS_CODES = ['238220'];
const SIC_CODES   = ['1711'];

// ─── Apollo helpers ───────────────────────────────────────────────────────────

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Step 1: search for people matching our criteria.
 * Returns raw Apollo people objects (no phone numbers yet).
 */
async function searchApolloContacts(page = 1) {
  const locationFilters = TARGET_CITIES.map(c => `${c}, Michigan, United States`);

  const payload = {
    api_key: APOLLO_API_KEY,
    person_titles: TARGET_TITLES,
    // Ask Apollo to match ANY of these titles (not require all)
    include_similar_titles: false,
    organization_locations: locationFilters,
    organization_num_employees_ranges: ['1,25'],
    organization_naics_codes: NAICS_CODES,
    organization_sic_codes: SIC_CODES,
    // Only surface people at HVAC / mechanical orgs
    q_organization_keyword_tags: ['HVAC', 'heating', 'air conditioning', 'plumbing', 'mechanical contracting'],
    per_page: 50,
    page,
  };

  const response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  return response.data.people || [];
}

/**
 * Step 2: enrich a batch of people to reveal phone numbers.
 * Apollo phone enrichment is ASYNC — this returns a request_id.
 * We poll for results with pollPhoneResults().
 *
 * Apollo allows max 10 people per bulk_match call.
 */
async function requestPhoneEnrichment(peopleIds) {
  const details = peopleIds.map(id => ({ id }));

  const payload = {
    api_key: APOLLO_API_KEY,
    details,
    reveal_phone_number: true,
  };

  const response = await axios.post(`${APOLLO_BASE}/people/bulk_match`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  // Some plans return synchronous results; others return only a request_id.
  // Handle both.
  if (response.data.matches && response.data.matches.length > 0) {
    return { matches: response.data.matches, requestId: null };
  }
  return { matches: [], requestId: response.data.request_id };
}

/**
 * Poll Apollo's webhook result endpoint until the async phone enrichment finishes.
 * Retries every 10 seconds for up to 2 minutes.
 */
async function pollPhoneResults(requestId) {
  const MAX_ATTEMPTS = 12;
  const DELAY_MS     = 10_000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(DELAY_MS);
    try {
      const response = await axios.get(
        `${APOLLO_BASE}/webhook_results/${requestId}`,
        {
          params:  { api_key: APOLLO_API_KEY },
          timeout: 15_000,
        }
      );
      if (response.status === 200 && response.data.matches) {
        return response.data.matches;
      }
    } catch (err) {
      // 404 = results not ready yet — keep polling
      if (err.response?.status !== 404) throw err;
    }
    console.log(`  [Apollo] Phone enrichment pending (attempt ${attempt}/${MAX_ATTEMPTS})…`);
  }
  throw new Error(`Apollo phone enrichment timed out after ${MAX_ATTEMPTS * DELAY_MS / 1000}s`);
}

/**
 * Pull enriched contacts with phone numbers.
 * Handles chunking into batches of 10 (Apollo limit) and async polling.
 */
async function enrichWithPhones(people) {
  const ids = people.map(p => p.id).filter(Boolean);
  if (ids.length === 0) return [];

  const allMatches = [];
  const chunkSize  = 10;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { matches, requestId } = await requestPhoneEnrichment(chunk);

    if (requestId) {
      const asyncMatches = await pollPhoneResults(requestId);
      allMatches.push(...asyncMatches);
    } else {
      allMatches.push(...matches);
    }
  }

  return allMatches;
}

/**
 * Pick the best available phone number for a person.
 * Priority: mobile → direct dial → any phone
 */
function extractBestPhone(person) {
  const numbers = person.phone_numbers || [];
  const mobile  = numbers.find(n => n.type === 'mobile');
  const direct  = numbers.find(n => n.type === 'direct');
  const any     = numbers[0];
  const chosen  = mobile || direct || any;
  return chosen ? chosen.sanitized_number || chosen.raw_number : null;
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

/**
 * Load the OAuth2 client. On first run, setup.js must be run to generate token.json.
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials.json not found. Run: cp credentials.json.example credentials.json\n' +
      'then fill in your Google OAuth client ID/secret, then run: npm run setup'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      'token.json not found — Google OAuth not completed yet.\n' +
      'Run: npm run setup   to authenticate your Google account.'
    );
  }

  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  return oAuth2Client;
}

/**
 * Return all business names currently in column B of the sheet (for duplicate checking).
 */
async function getExistingBusinessNames(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const range  = `${SHEET_TAB}!B:B`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  // row[0] is the header "Business Name" — skip it
  return new Set(
    rows.slice(1).map(r => (r[0] || '').trim().toLowerCase()).filter(Boolean)
  );
}

/**
 * Write the column headers to row 1 if the sheet is empty.
 */
async function ensureHeaders(auth) {
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1:I1`,
  });

  const firstRow = (res.data.values || [[]])[0];
  if (!firstRow || firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_HEADERS] },
    });
    console.log('  [Sheets] Column headers written.');
  }
}

/**
 * Append rows to the sheet.
 * Each row: [Date Added, Business Name, First, Last, Phone, City, Website, '', '']
 */
async function appendLeads(auth, rows) {
  if (rows.length === 0) return;
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId:  SHEET_ID,
    range:          `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Email notification ───────────────────────────────────────────────────────

async function sendErrorEmail(subject, body) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('[Email] SMTP credentials not set — skipping email alert.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from:    process.env.SMTP_USER,
    to:      NOTIFICATION_EMAIL,
    subject: `[HVAC Lead Gen] ${subject}`,
    text:    body,
  });

  console.log(`  [Email] Alert sent to ${NOTIFICATION_EMAIL}`);
}

// ─── Core run logic ───────────────────────────────────────────────────────────

async function runLeadGen() {
  const startedAt = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Lead Gen] Run started: ${startedAt}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // 1. Authenticate with Google Sheets
    const auth = await getAuthClient();

    // 2. Ensure headers exist in the sheet
    await ensureHeaders(auth);

    // 3. Fetch existing business names to skip duplicates
    console.log('[Sheets] Reading existing entries for duplicate check…');
    const existingNames = await getExistingBusinessNames(auth);
    console.log(`  → ${existingNames.size} existing entries loaded`);

    // 4. Search Apollo for decision-makers at SW Michigan HVAC companies
    console.log('[Apollo] Searching for HVAC decision-makers in SW Michigan…');
    const rawPeople = await searchApolloContacts(1);
    console.log(`  → ${rawPeople.length} contacts returned from Apollo search`);

    if (rawPeople.length === 0) {
      const msg = 'Apollo returned 0 results for the current search criteria.';
      console.warn(`  [WARN] ${msg}`);
      await sendErrorEmail('No Apollo results', `${msg}\n\nRun started: ${startedAt}`);
      return;
    }

    // 5. Enrich the batch with phone numbers (Apollo async flow)
    console.log('[Apollo] Requesting phone enrichment…');
    const enriched = await enrichWithPhones(rawPeople);
    console.log(`  → ${enriched.length} contacts enriched`);

    // 6. Filter: must have a phone number, must have a name
    const qualified = enriched.filter(p => {
      const phone = extractBestPhone(p);
      return phone && p.first_name;
    });
    console.log(`  → ${qualified.length} contacts have a phone number`);

    if (qualified.length === 0) {
      const msg = 'Apollo returned contacts but none had an accessible phone number. ' +
                  'This may indicate a plan limitation — check your Apollo credit balance.';
      console.warn(`  [WARN] ${msg}`);
      await sendErrorEmail('Zero contacts with phone numbers', `${msg}\n\nRun started: ${startedAt}`);
      return;
    }

    // 7. Build sheet rows, skipping duplicates, capped at MAX_LEADS
    const today  = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    const newRows = [];

    for (const person of qualified) {
      if (newRows.length >= MAX_LEADS) break;

      const bizName = (person.organization?.name || person.employment_history?.[0]?.organization_name || '').trim();
      if (!bizName) continue;

      // Duplicate check — case-insensitive by business name
      if (existingNames.has(bizName.toLowerCase())) {
        console.log(`  [Skip] Already in sheet: ${bizName}`);
        continue;
      }

      const phone   = extractBestPhone(person);
      const city    = person.city || person.organization?.city || '';
      const website = person.organization?.website_url || person.organization?.primary_domain || '';

      newRows.push([
        today,
        bizName,
        person.first_name || '',
        person.last_name  || '',
        phone,
        city,
        website,
        '',  // Called — filled in manually
        '',  // Notes  — filled in manually
      ]);
    }

    // 8. Write to sheet
    if (newRows.length === 0) {
      console.log('[Sheets] No new leads to add (all were duplicates or filtered).');
      return;
    }

    console.log(`[Sheets] Appending ${newRows.length} new lead(s)…`);
    await appendLeads(auth, newRows);

    console.log(`\n✓ Done. ${newRows.length} new lead(s) added to the sheet.`);
    console.log(`  Sheet: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);

  } catch (err) {
    const errMsg = err.stack || err.message || String(err);
    console.error(`\n[ERROR] ${errMsg}`);

    // Try to email the error
    try {
      await sendErrorEmail(
        'Workflow failed',
        `The HVAC lead gen workflow encountered an error.\n\nRun started: ${startedAt}\n\nError:\n${errMsg}`
      );
    } catch (emailErr) {
      console.error('[Email] Failed to send error notification:', emailErr.message);
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const RUN_NOW = process.argv.includes('--run-now');

if (RUN_NOW) {
  // One-shot execution — useful for testing or manual triggers
  runLeadGen().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  // Cron mode: every morning at 7:00 AM Eastern Time
  console.log('[Lead Gen] Scheduler started. Will run daily at 7:00 AM Eastern Time.');
  console.log(`[Lead Gen] Sheet: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
  console.log('[Lead Gen] Run "node lead-gen.js --run-now" to trigger immediately.\n');

  cron.schedule('0 7 * * *', () => {
    runLeadGen();
  }, {
    timezone: 'America/New_York',
  });
}
