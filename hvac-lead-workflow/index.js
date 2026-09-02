/**
 * HVAC Lead Generation Workflow
 * ─────────────────────────────
 * Searches Apollo.io for HVAC owner/decision-makers in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends up to 25 new
 * leads per run. Runs automatically at 7 AM Eastern via node-cron.
 *
 * Usage:
 *   node index.js              → start the scheduler (runs at 7 AM ET daily)
 *   node index.js --run-now   → execute one fetch immediately, then exit
 *
 * Requirements:
 *   • Apollo Basic plan or higher (free plan blocks the People prospecting API)
 *   • Google service account with Sheets API enabled and edit access to the sheet
 *   • Copy .env.example → .env and fill in your values before running
 */

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────

const APOLLO_API_KEY   = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID   = process.env.SPREADSHEET_ID;
const SHEET_NAME       = process.env.SHEET_NAME || 'Sheet1';
const NOTIFY_EMAIL     = process.env.NOTIFY_EMAIL;
const GMAIL_USER       = process.env.GMAIL_USER;
const GMAIL_APP_PW     = process.env.GMAIL_APP_PASSWORD;
const MAX_LEADS        = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const CRON_SCHEDULE    = process.env.CRON_SCHEDULE || '0 7 * * *';

// Target cities for Southwest Michigan
// Edit this array to add/remove cities without touching the search logic below.
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Job titles to target, in priority order.
// Apollo will match these + similar titles (e.g. "co-owner" matches "Owner").
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo industry keywords — matched against company description/tags.
const INDUSTRY_KEYWORDS = 'HVAC heating air conditioning plumbing mechanical contracting';

// Google Sheets column order (A=0, B=1, …)
// Change ONLY the order here if you restructure your sheet columns.
const COLUMNS = {
  DATE_ADDED:    0,  // A
  BUSINESS_NAME: 1,  // B
  OWNER_FIRST:   2,  // C
  OWNER_LAST:    3,  // D
  PHONE:         4,  // E
  CITY:          5,  // F
  WEBSITE:       6,  // G
  CALLED:        7,  // H  (left blank by this script)
  NOTES:         8,  // I  (left blank by this script)
};

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function notifyError(subject, detail) {
  log(`ERROR: ${subject}\n${detail}`);

  // Email notification (optional — only fires if Gmail credentials are set)
  if (!NOTIFY_EMAIL || !GMAIL_USER || !GMAIL_APP_PW) return;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PW },
    });
    await transporter.sendMail({
      from: GMAIL_USER,
      to: NOTIFY_EMAIL,
      subject: `[HVAC Leads] ${subject}`,
      text: `${detail}\n\nTimestamp: ${new Date().toISOString()}`,
    });
    log(`Error notification emailed to ${NOTIFY_EMAIL}`);
  } catch (err) {
    log(`Failed to send error email: ${err.message}`);
  }
}

// ── Google Sheets Client ──────────────────────────────────────────────────────

function buildSheetsClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyFile || !fs.existsSync(keyFile)) {
    throw new Error(
      `Google service account JSON not found at: ${keyFile}\n` +
      'See the README for setup instructions.'
    );
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Returns the set of Business Names already in the sheet (column B).
 * Used to skip duplicates before inserting.
 */
async function getExistingBusinessNames(sheets) {
  const range = `${SHEET_NAME}!B:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  const rows = res.data.values || [];
  // Row 0 is the header ("Business Name"), skip it
  return new Set(rows.slice(1).map(r => (r[0] || '').trim().toLowerCase()));
}

/**
 * Appends an array of lead rows to the sheet.
 * Each row must be ordered according to COLUMNS above.
 */
async function appendLeads(sheets, rows) {
  const range = `${SHEET_NAME}!A:I`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ── Apollo API ────────────────────────────────────────────────────────────────

const apolloClient = axios.create({
  baseURL: 'https://api.apollo.io',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  },
  timeout: 30_000,
});

/**
 * Step 1: Search Apollo for people matching our criteria.
 * Returns an array of raw person objects (last names may be masked on some plans).
 */
async function searchApolloContacts(page = 1) {
  const payload = {
    api_key: APOLLO_API_KEY,

    // Target job titles (Owner → GM in priority order)
    person_titles: TARGET_TITLES,

    // Person's own location — NOT their employer's HQ
    person_locations: TARGET_CITIES,

    // Employer headquartered in Michigan
    organization_locations: ['Michigan, United States'],

    // Industry keywords matched against company tags/description
    q_keywords: INDUSTRY_KEYWORDS,

    // Owner-operated small businesses only (1–25 employees)
    organization_num_employees_ranges: ['1,25'],

    // Only return people that have phone numbers on record
    // Apollo doesn't expose a direct "has_phone" filter at search time,
    // so we request the max per page and filter after enrichment.
    per_page: 50,
    page,
  };

  const res = await apolloClient.post('/api/v1/mixed_people/search', payload);
  return res.data.people || [];
}

/**
 * Step 2: Enrich person records by ID to reveal full names and phone numbers.
 * Apollo masks last names in search results on some plans; enrichment reveals them.
 * Returns an array of enriched person objects.
 */
async function enrichPeople(personIds) {
  if (personIds.length === 0) return [];

  // Apollo bulk match accepts up to 10 IDs per call
  const chunks = [];
  for (let i = 0; i < personIds.length; i += 10) {
    chunks.push(personIds.slice(i, i + 10));
  }

  const enriched = [];
  for (const chunk of chunks) {
    const payload = {
      api_key: APOLLO_API_KEY,
      details: chunk.map(id => ({ id })),
    };
    const res = await apolloClient.post('/api/v1/people/bulk_match', payload);
    const matches = res.data.matches || [];
    enriched.push(...matches);
  }
  return enriched;
}

/**
 * Extracts the best available phone number from an enriched person record.
 * Priority: mobile → direct → organization phone.
 */
function pickPhone(person) {
  const phones = person.phone_numbers || [];
  // Prefer mobile, then direct/work
  const mobile = phones.find(p => p.type === 'mobile' || p.sanitized_number?.length === 10);
  if (mobile) return formatPhone(mobile.sanitized_number || mobile.raw_number);
  const direct = phones.find(p => p.type === 'direct');
  if (direct) return formatPhone(direct.sanitized_number || direct.raw_number);
  if (phones.length > 0) return formatPhone(phones[0].sanitized_number || phones[0].raw_number);

  // Fall back to the org's main number
  const orgPhone = person.organization?.phone || person.sanitized_phone;
  return orgPhone ? formatPhone(orgPhone) : null;
}

function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw; // return as-is if format is unexpected
}

// ── Main Workflow ─────────────────────────────────────────────────────────────

async function runWorkflow() {
  log('─'.repeat(60));
  log('Starting HVAC lead generation run');

  // Validate required config before doing any API calls
  if (!APOLLO_API_KEY) {
    await notifyError('Missing APOLLO_API_KEY', 'Set APOLLO_API_KEY in your .env file.');
    return;
  }
  if (!SPREADSHEET_ID) {
    await notifyError('Missing SPREADSHEET_ID', 'Set SPREADSHEET_ID in your .env file.');
    return;
  }

  let sheets;
  try {
    sheets = buildSheetsClient();
  } catch (err) {
    await notifyError('Google Sheets init failed', err.message);
    return;
  }

  // ── 1. Load existing business names to skip duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    log(`Sheet has ${existingNames.size} existing business(es) — will skip these`);
  } catch (err) {
    await notifyError('Could not read Google Sheet', err.message);
    return;
  }

  // ── 2. Search Apollo for candidates
  let rawPeople = [];
  try {
    log('Searching Apollo.io for HVAC owners in Southwest Michigan…');
    rawPeople = await searchApolloContacts(1);
    log(`Apollo returned ${rawPeople.length} candidate(s)`);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    await notifyError('Apollo search failed', msg);
    return;
  }

  if (rawPeople.length === 0) {
    await notifyError(
      'Apollo returned no results',
      'The search returned 0 people. The filters may be too narrow or your Apollo plan may not support this API. ' +
      'Check your plan at https://app.apollo.io/#/settings/billing'
    );
    return;
  }

  // ── 3. Enrich to get full names + phone numbers
  const personIds = rawPeople.map(p => p.id).filter(Boolean);
  let enriched = [];
  try {
    log(`Enriching ${personIds.length} record(s) to reveal phones…`);
    enriched = await enrichPeople(personIds);
    log(`Enrichment returned ${enriched.length} record(s)`);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    await notifyError('Apollo enrichment failed', msg);
    return;
  }

  // ── 4. Build lead rows — filter, deduplicate, cap at MAX_LEADS
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }); // e.g. "09/02/2026"

  const newRows = [];

  for (const person of enriched) {
    if (newRows.length >= MAX_LEADS) break;

    const businessName = (
      person.organization?.name ||
      person.employment_history?.[0]?.organization_name ||
      ''
    ).trim();

    if (!businessName) continue;

    // Skip duplicates
    if (existingNames.has(businessName.toLowerCase())) {
      log(`  SKIP (duplicate): ${businessName}`);
      continue;
    }

    const phone = pickPhone(person);
    if (!phone) {
      log(`  SKIP (no phone): ${businessName}`);
      continue;
    }

    const city = (
      person.city ||
      person.organization?.city ||
      ''
    ).trim();

    const website = (
      person.organization?.website_url ||
      person.organization?.primary_domain && `https://${person.organization.primary_domain}` ||
      ''
    ).trim();

    // Build row in column order defined by COLUMNS constant above
    const row = new Array(9).fill('');
    row[COLUMNS.DATE_ADDED]    = today;
    row[COLUMNS.BUSINESS_NAME] = businessName;
    row[COLUMNS.OWNER_FIRST]   = person.first_name || '';
    row[COLUMNS.OWNER_LAST]    = person.last_name || '';
    row[COLUMNS.PHONE]         = phone;
    row[COLUMNS.CITY]          = city;
    row[COLUMNS.WEBSITE]       = website;
    // CALLED and NOTES intentionally left blank

    newRows.push(row);
    log(`  + ${businessName} | ${person.first_name} ${person.last_name} | ${phone} | ${city}`);
  }

  if (newRows.length === 0) {
    log('No new leads to add — all results were duplicates or missing phone numbers.');
    return;
  }

  // ── 5. Write to Google Sheet
  try {
    await appendLeads(sheets, newRows);
    log(`✓ Appended ${newRows.length} new lead(s) to the sheet`);
  } catch (err) {
    await notifyError(
      `Google Sheet write failed (${newRows.length} leads not saved)`,
      err.message
    );
    return;
  }

  log('Run complete.');
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function verifyConnections() {
  log('Verifying connections before scheduler starts…');
  let ok = true;

  // Check Apollo key is set
  if (!APOLLO_API_KEY || APOLLO_API_KEY === 'your_apollo_api_key_here') {
    log('  ✗ APOLLO_API_KEY is not configured');
    ok = false;
  } else {
    log('  ✓ APOLLO_API_KEY is set');
  }

  // Check Google credentials file exists
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyFile || !fs.existsSync(keyFile)) {
    log(`  ✗ Google service account JSON not found at: ${keyFile}`);
    ok = false;
  } else {
    // Try reading the sheet to confirm access
    try {
      const sheets = buildSheetsClient();
      await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      log(`  ✓ Google Sheets: connected to spreadsheet ${SPREADSHEET_ID}`);
    } catch (err) {
      log(`  ✗ Google Sheets connection failed: ${err.message}`);
      ok = false;
    }
  }

  if (!ok) {
    log('\n⚠  Fix the issues above before the first scheduled run executes.');
    log('   Run `node index.js --run-now` after fixing to test immediately.');
  } else {
    log('\n✓ All connections verified. Scheduler is running.');
    log(`  Schedule: "${CRON_SCHEDULE}" (America/New_York)`);
    log('  Next run: 7:00 AM Eastern tomorrow');
  }
  return ok;
}

(async () => {
  const runNow = process.argv.includes('--run-now');

  if (runNow) {
    // One-shot mode: run immediately and exit
    log('--run-now flag detected: executing one run immediately');
    await runWorkflow();
    process.exit(0);
  }

  // Scheduler mode: verify connections, then set up cron
  await verifyConnections();

  cron.schedule(CRON_SCHEDULE, async () => {
    await runWorkflow();
  }, {
    timezone: 'America/New_York',
  });

  log('Process is running. Press Ctrl+C to stop.');
})();
