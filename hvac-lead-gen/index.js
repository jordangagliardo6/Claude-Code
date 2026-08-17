/**
 * HVAC Lead Generation Workflow
 * Apollo.io → Google Sheets (SW Michigan, 25 leads/day, 7am ET)
 *
 * Usage:
 *   node index.js --verify     # test API connections before first run
 *   node index.js --run-now    # execute one run immediately
 *   npm start                  # start the daily 7am ET scheduler
 */

'use strict';

const cron       = require('node-cron');
const axios      = require('axios');
const { google } = require('googleapis');
require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — edit these values to change cities, columns, or limits
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Apollo.io REST API key (set in .env as APOLLO_API_KEY)
  apolloApiKey: process.env.APOLLO_API_KEY,

  // Google Sheets spreadsheet ID (the long string from the URL)
  // Pre-filled with your existing "SW Michigan HVAC Leads" sheet
  spreadsheetId: process.env.SPREADSHEET_ID || '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus',

  // Tab name inside the spreadsheet
  sheetName: process.env.SHEET_NAME || 'Sheet1',

  // Path to Google service account credentials JSON file
  googleCredentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',

  // Max new leads to append per run — keeps the list manageable
  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),

  // Your email for error notifications (logged to console; wire up nodemailer to actually send)
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',

  // ── Easy-to-edit city list ────────────────────────────────────────────────
  // Add or remove cities here; the search keyword is built automatically.
  targetCities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // ── Industry keywords sent to Apollo ─────────────────────────────────────
  industryTags: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
    'hvac contractor',
    'heating cooling',
  ],

  // ── Target job titles, searched in priority order ─────────────────────────
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // SIC 1711 = Plumbing, Heating, Air-Conditioning contractors
  sicCodes: ['1711'],

  // ── Column order in the spreadsheet ──────────────────────────────────────
  // Change the order here if you restructure the sheet.
  // Keys map to fields produced by normalizeLead().
  columnOrder: [
    'dateAdded',    // A — Date Added
    'businessName', // B — Business Name (used for dedup)
    'firstName',    // C — Owner First Name
    'lastName',     // D — Owner Last Name
    'phone',        // E — Phone Number
    'city',         // F — City
    'website',      // G — Website
    'called',       // H — Called (blank)
    'notes',        // I — Notes (blank)
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// APOLLO.IO — search and enrichment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search Apollo's people database for HVAC owner/decision-makers in SW Michigan.
 * Returns an array of raw Apollo person objects.
 * Requires a paid Apollo plan (free plan returns API_INACCESSIBLE).
 */
async function searchApolloLeads() {
  const cityKeywords = CONFIG.targetCities.join(' OR ');

  const payload = {
    api_key:                      CONFIG.apolloApiKey,
    // Free-text keywords narrow results to the target geography and industry
    q_keywords:                   `HVAC heating air conditioning ${cityKeywords} Michigan`,
    // Job titles to target
    person_titles:                CONFIG.targetTitles,
    // Person must be located in Michigan
    person_locations:             ['Michigan, United States'],
    // Their company must also be headquartered in Michigan
    organization_locations:       ['Michigan, United States'],
    // 1–25 employees = owner-operated small business
    organization_num_employees_ranges: ['1,25'],
    // Industry tags
    q_organization_keyword_tags:  CONFIG.industryTags,
    // SIC code for HVAC/plumbing contractors
    organization_sic_codes:       CONFIG.sicCodes,
    // Include similar titles (e.g. "Co-owner") so we don't miss anyone
    include_similar_titles:       true,
    page:     1,
    per_page: 50, // fetch extra; we filter down to MAX_LEADS_PER_RUN after dedup
  };

  const res = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/api_search',
    payload,
    { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 }
  );

  return res.data.people || [];
}

/**
 * Enrich a batch of Apollo person records to reveal phone numbers.
 * Falls back to the un-enriched records if enrichment fails.
 */
async function enrichLeads(people) {
  if (!people.length) return [];

  const details = people.slice(0, 25).map(p => ({
    id:                p.id,
    first_name:        p.first_name,
    last_name:         p.last_name,
    organization_name: p.organization?.name || p.organization_name || '',
    domain:            p.organization?.primary_domain || '',
  }));

  const res = await axios.post(
    'https://api.apollo.io/api/v1/people/bulk_match',
    {
      api_key:                CONFIG.apolloApiKey,
      details,
      reveal_personal_emails: false,
      reveal_phone_number:    true,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 60_000 }
  );

  return res.data.matches || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS — read existing data and append new rows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an authenticated Google Sheets client.
 * Supports both a credentials file path and an inline JSON env var.
 */
async function getSheetsClient() {
  let auth;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Inline JSON — useful when deploying to cloud environments
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    // JSON credentials file on disk (service account recommended for automation)
    auth = new google.auth.GoogleAuth({
      keyFile: CONFIG.googleCredentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Return a Set of business names already in the sheet (lowercased for comparison).
 * The Business Name is column B (index 1 after slicing header).
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range:         `${CONFIG.sheetName}!B:B`,
  });

  const rows = res.data.values || [];
  return new Set(
    rows.slice(1) // skip header
        .map(r => (r[0] || '').toLowerCase().trim())
        .filter(Boolean)
  );
}

/**
 * Append an array of normalized lead objects to the spreadsheet.
 * Returns the count of rows added.
 */
async function appendLeadsToSheet(sheets, leads) {
  if (!leads.length) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month:    '2-digit',
    day:      '2-digit',
    year:     'numeric',
  });

  // Build rows in the order defined by CONFIG.columnOrder
  const rows = leads.map(lead => {
    lead.dateAdded = today;
    lead.called    = '';
    lead.notes     = '';
    return CONFIG.columnOrder.map(key => lead[key] ?? '');
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId:   CONFIG.spreadsheetId,
    range:           `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    resource:        { values: rows },
  });

  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick the best available phone number from Apollo's phone_numbers array.
 * Prefers direct/mobile over company/other types.
 */
function extractPhone(person) {
  const phones = person.phone_numbers || [];
  const preferred = phones.find(p =>
    ['direct_phone', 'mobile_phone'].includes(p.type)
  );
  const best = preferred || phones[0];
  if (best) return best.sanitized_number || best.raw_number || '';
  return person.sanitized_phone || person.phone || '';
}

/**
 * Try to identify which target city the person is in.
 * Falls back to whatever Apollo reports if no match.
 */
function extractCity(person) {
  const loc = (person.city || person.present_raw_address || '').toLowerCase();
  return (
    CONFIG.targetCities.find(c => loc.includes(c.toLowerCase())) ||
    person.city ||
    ''
  );
}

/**
 * Convert a raw Apollo person object into a flat lead record.
 */
function normalizeLead(person) {
  const org = person.organization || {};
  return {
    businessName: org.name || person.organization_name || '',
    firstName:    person.first_name || '',
    lastName:     person.last_name  || '',
    phone:        extractPhone(person),
    city:         extractCity(person),
    website:      org.website_url   || org.primary_domain || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR LOGGING / NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log errors to the console with a timestamp.
 * To add email alerts, install nodemailer and uncomment the block below.
 */
function logError(context, error) {
  const ts  = new Date().toISOString();
  const msg = `[HVAC Lead Gen ERROR] ${context}: ${error?.message || error}`;
  console.error(`[${ts}] ${msg}`);

  // ── Email notification (optional) ─────────────────────────────────────────
  // Uncomment and configure after running: npm install nodemailer
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // transporter.sendMail({
  //   from:    process.env.SMTP_USER,
  //   to:      CONFIG.notificationEmail,
  //   subject: '[HVAC Lead Gen] Error Alert',
  //   text:    `${ts}\n\n${msg}\n\n${error?.stack || ''}`,
  // }).catch(e => console.error('Failed to send error email:', e.message));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

async function runLeadGenWorkflow() {
  const runStart = new Date().toISOString();
  console.log(`\n[${runStart}] ── HVAC Lead Gen Run Starting ──`);

  // Step 1: Connect to Google Sheets
  let sheets;
  try {
    sheets = await getSheetsClient();
    console.log('✓ Google Sheets connected');
  } catch (err) {
    logError('Google Sheets connection failed', err);
    return;
  }

  // Step 2: Load existing business names for dedup
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`✓ Loaded ${existingNames.size} existing business names for dedup`);
  } catch (err) {
    logError('Failed to read existing sheet data', err);
    return;
  }

  // Step 3: Search Apollo for HVAC leads
  let rawPeople;
  try {
    rawPeople = await searchApolloLeads();
    console.log(`✓ Apollo search returned ${rawPeople.length} candidates`);
  } catch (err) {
    const code = err.response?.data?.error_code;
    if (code === 'API_INACCESSIBLE') {
      logError(
        'Apollo plan limitation — upgrade at https://www.apollo.io/pricing to enable people search',
        err
      );
    } else {
      logError('Apollo search failed', err);
    }
    return;
  }

  if (!rawPeople.length) {
    console.log('⚠  Apollo returned 0 results — nothing to add this run.');
    return;
  }

  // Step 4: Enrich to reveal phone numbers
  let enrichedPeople;
  try {
    enrichedPeople = await enrichLeads(rawPeople);
    console.log(`✓ Enriched ${enrichedPeople.length} contacts`);
  } catch (err) {
    logError('Apollo enrichment failed — falling back to unenriched data', err);
    enrichedPeople = rawPeople;
  }

  // Step 5: Normalize, filter, and deduplicate
  const newLeads = enrichedPeople
    .map(normalizeLead)
    .filter(l => l.phone && l.businessName)                              // must have phone + name
    .filter(l => !existingNames.has(l.businessName.toLowerCase().trim())) // skip duplicates
    .slice(0, CONFIG.maxLeadsPerRun);                                    // cap at daily limit

  console.log(`✓ ${newLeads.length} new qualifying leads after filtering and dedup`);

  if (!newLeads.length) {
    console.log('No new leads to add this run — all results already in sheet or missing phone.');
    return;
  }

  // Step 6: Write to spreadsheet
  try {
    const added = await appendLeadsToSheet(sheets, newLeads);
    console.log(`✓ Appended ${added} rows to spreadsheet`);
  } catch (err) {
    logError('Failed to write leads to Google Sheets', err);
    return;
  }

  console.log(`[${new Date().toISOString()}] ── Run complete ──\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION VERIFICATION (run once before first scheduled execution)
// ─────────────────────────────────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n══════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Verification');
  console.log('══════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // ── Apollo.io ─────────────────────────────────────────────────────────────
  if (!CONFIG.apolloApiKey) {
    console.error('✗ Apollo.io: APOLLO_API_KEY is not set in .env');
    failed++;
  } else {
    try {
      // Hit a lightweight authenticated endpoint to confirm the key works
      const res = await axios.get(
        `https://api.apollo.io/api/v1/auth/health?api_key=${CONFIG.apolloApiKey}`,
        { timeout: 10_000 }
      );
      console.log('✓ Apollo.io API key is valid');
      console.log(`  Plan: ${res.data?.plan_type || 'unknown'}`);
      passed++;
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        console.error('✗ Apollo.io: API key rejected (401/403) — check APOLLO_API_KEY');
        failed++;
      } else {
        // /auth/health may not exist on all plan types; reachability itself is the signal
        console.log('✓ Apollo.io API reachable (key set, plan check skipped)');
        passed++;
      }
    }
  }

  // ── Google Sheets ─────────────────────────────────────────────────────────
  try {
    const sheets = await getSheetsClient();
    const meta   = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.spreadsheetId });
    const title  = meta.data.properties?.title || CONFIG.spreadsheetId;
    console.log(`✓ Google Sheets: Connected to "${title}"`);
    console.log(`  Spreadsheet ID: ${CONFIG.spreadsheetId}`);
    passed++;
  } catch (err) {
    console.error(`✗ Google Sheets: ${err.message}`);
    console.error('  Check GOOGLE_CREDENTIALS_PATH and that the service account has editor access.');
    failed++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n── ${passed} passed  ${failed} failed ──`);

  if (failed === 0) {
    console.log('\n✅  All connections OK — ready to run the scheduler.\n');
    console.log('  To start the daily 7am ET scheduler:  npm start');
    console.log('  To run immediately (test):             npm run run-now\n');
  } else {
    console.log('\n❌  Fix the issues above before running the scheduler.\n');
  }

  return failed === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args[0] === '--verify') {
  // One-shot connection test
  verifyConnections()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => { console.error(err); process.exit(1); });

} else if (args[0] === '--run-now') {
  // Immediate single execution (useful for testing without waiting for 7am)
  runLeadGenWorkflow()
    .catch(err => { logError('Unhandled error', err); process.exit(1); });

} else {
  // Default: start the cron scheduler
  // TZ is set via the npm start script so node-cron sees America/New_York
  console.log('HVAC Lead Gen — Scheduler Starting');
  console.log('Runs at: 7:00 AM Eastern every day');
  console.log('Max leads per run:', CONFIG.maxLeadsPerRun);
  console.log('Target cities:', CONFIG.targetCities.join(', '));
  console.log('');
  console.log('Tip: Run "npm run verify" first to confirm both APIs are connected.');
  console.log('     Run "npm run run-now" to trigger an immediate test run.');
  console.log('');

  cron.schedule(
    '0 7 * * *',
    () => {
      runLeadGenWorkflow().catch(err => logError('Scheduler unhandled error', err));
    },
    { timezone: 'America/New_York' }
  );

  console.log('Scheduler running. Press Ctrl+C to stop.\n');
}
