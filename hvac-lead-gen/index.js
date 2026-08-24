/**
 * HVAC Lead Generation Workflow
 * Searches Apollo.io for HVAC company owners in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends new leads.
 *
 * Schedule: 7:00 AM Eastern Time, every day
 * Max leads per run: 25
 *
 * Environment variables required:
 *   APOLLO_API_KEY          — Apollo.io API key (paid plan required)
 *   GOOGLE_SHEET_ID         — Target Google Sheet ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL — Service account email
 *   GOOGLE_PRIVATE_KEY      — Service account private key (replace \n with actual newlines in .env)
 *   NOTIFICATION_EMAIL      — Email to alert on errors (optional, logs to console if omitted)
 */

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  // Apollo search filters — edit these to change your target market
  targetCities: [
    'St. Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
    'Grand Haven', 'Muskegon', 'South Haven',
  ],
  targetIndustryKeywords: ['HVAC', 'Heating and Air Conditioning', 'Plumbing', 'Mechanical Contracting'],
  targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
  companySizeMax: 25,
  maxLeadsPerRun: 25,

  // Google Sheet column order (A=0 through I=8)
  // If you add/remove columns, update this map and the buildRow() function below.
  sheetColumns: {
    dateAdded: 0,
    businessName: 1,
    ownerFirstName: 2,
    ownerLastName: 3,
    phoneNumber: 4,
    city: 5,
    website: 6,
    called: 7,   // left blank by workflow
    notes: 8,    // left blank by workflow
  },

  // Google Sheet details
  spreadsheetId: process.env.GOOGLE_SHEET_ID || '1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo',
  sheetName: 'Sheet1',  // change if your tab has a different name

  // Cron: 7:00 AM Eastern = 12:00 UTC (EST) / 11:00 UTC (EDT)
  // This uses America/New_York timezone so DST is handled automatically.
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',
};

// ─── Apollo.io Client ─────────────────────────────────────────────────────────

/**
 * Searches Apollo for HVAC/plumbing owners in SW Michigan.
 * Apollo's paid-plan people search endpoint returns up to `perPage` contacts.
 *
 * Requires plan: Basic ($49/mo) or higher for API access.
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */
async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  const cityQuery = CONFIG.targetCities.join(' OR ');
  const industryQuery = CONFIG.targetIndustryKeywords.join(' OR ');

  const payload = {
    api_key: apiKey,
    // Search people by title
    person_titles: CONFIG.targetTitles,
    // Strict title matching — Owner means Owner, not "Account Owner"
    include_similar_titles: false,
    // Person must be located in Michigan
    person_locations: ['Michigan, United States'],
    // Company HQ also in Michigan
    organization_locations: ['Michigan, United States'],
    // Company keyword tags covering our target industries
    q_organization_keyword_tags: CONFIG.targetIndustryKeywords,
    // Company size: 1–25 employees
    organization_num_employees_ranges: [`1,${CONFIG.companySizeMax}`],
    // Narrow to SW Michigan cities + HVAC keywords
    q_keywords: `(${cityQuery}) (${industryQuery}) Michigan`,
    // Return up to maxLeadsPerRun contacts per call
    per_page: CONFIG.maxLeadsPerRun,
    page: 1,
  };

  const response = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  const people = response.data?.people ?? [];
  log(`Apollo returned ${people.length} raw result(s)`);

  // Filter out contacts with no phone number
  return people.filter(p => extractPhone(p));
}

/** Pulls the best available phone number from an Apollo person record. */
function extractPhone(person) {
  // Prefer mobile, then direct, then any listed number
  return (
    person.mobile_phone ||
    person.phone ||
    (person.phone_numbers && person.phone_numbers[0]?.sanitized_number) ||
    null
  );
}

/** Builds a row array matching CONFIG.sheetColumns order. */
function buildRow(person, today) {
  const org = person.organization || {};
  return [
    today,                                  // Date Added
    org.name || '',                          // Business Name
    person.first_name || '',                 // Owner First Name
    person.last_name || '',                  // Owner Last Name
    extractPhone(person) || '',              // Phone Number
    person.city || org.city || '',          // City
    org.website_url || org.primary_domain || '',  // Website
    '',                                      // Called (blank)
    '',                                      // Notes (blank)
  ];
}

// ─── Google Sheets Client ─────────────────────────────────────────────────────

function buildSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/** Reads the Business Name column from the sheet and returns a Set of existing names (lowercased). */
async function fetchExistingBusinessNames(sheets) {
  const range = `${CONFIG.sheetName}!B:B`; // Column B = Business Name
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  // Skip header row (row 0), lowercase for case-insensitive dedup
  return new Set(
    rows.slice(1)
      .map(r => (r[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Appends an array of rows to the sheet. */
async function appendRows(sheets, rows) {
  if (rows.length === 0) return;

  const range = `${CONFIG.sheetName}!A:I`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Core Workflow ────────────────────────────────────────────────────────────

async function runWorkflow() {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  log(`\n${'─'.repeat(60)}`);
  log(`HVAC Lead Gen Run — ${today}`);
  log('─'.repeat(60));

  let apolloResults = [];
  let existingNames = new Set();
  let newRows = [];

  // 1. Fetch leads from Apollo
  try {
    apolloResults = await searchApolloLeads();
    log(`Fetched ${apolloResults.length} leads with phone numbers from Apollo`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.response?.data?.error || err.message}`;
    await handleError(msg, err);
    return;
  }

  if (apolloResults.length === 0) {
    log('Apollo returned 0 results. No leads to add.');
    await handleError('Apollo returned 0 results for today\'s run. Check filters or API quota.', null);
    return;
  }

  // 2. Read existing sheet to detect duplicates
  let sheets;
  try {
    sheets = buildSheetsClient();
    existingNames = await fetchExistingBusinessNames(sheets);
    log(`Found ${existingNames.size} existing business(es) in sheet`);
  } catch (err) {
    const msg = `Google Sheets read failed: ${err.message}`;
    await handleError(msg, err);
    return;
  }

  // 3. Deduplicate and build rows
  for (const person of apolloResults) {
    if (newRows.length >= CONFIG.maxLeadsPerRun) break;

    const bizName = (person.organization?.name || '').trim().toLowerCase();
    if (!bizName) continue;
    if (existingNames.has(bizName)) {
      log(`  SKIP (duplicate): ${person.organization?.name}`);
      continue;
    }

    existingNames.add(bizName); // prevent in-run dupes if Apollo returns same company twice
    newRows.push(buildRow(person, today));
    log(`  ADD: ${person.organization?.name} — ${person.first_name} ${person.last_name} — ${extractPhone(person)}`);
  }

  log(`${newRows.length} new lead(s) to append`);

  // 4. Append to sheet
  if (newRows.length === 0) {
    log('All results were duplicates. Sheet unchanged.');
    return;
  }

  try {
    await appendRows(sheets, newRows);
    log(`Successfully appended ${newRows.length} lead(s) to Google Sheet.`);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    await handleError(msg, err);
  }
}

// ─── Error Handling ───────────────────────────────────────────────────────────

async function handleError(message, err) {
  log(`ERROR: ${message}`);
  if (err?.stack) log(err.stack);

  // Console always gets the error.
  // If NOTIFICATION_EMAIL is set, you could wire up Nodemailer here.
  // Example placeholder — swap in your SMTP/email provider:
  if (process.env.NOTIFICATION_EMAIL) {
    log(`[ALERT] Would email ${process.env.NOTIFICATION_EMAIL}: "${message}"`);
    // To enable actual email, install nodemailer and uncomment:
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({ ... });
    // await transporter.sendMail({ to: process.env.NOTIFICATION_EMAIL, subject: 'HVAC Lead Gen Error', text: message });
  }
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
  console.log(`[${ts}] ${msg}`);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // `npm run test-run` or `node index.js --run-now` → execute immediately
  log('Manual trigger — running workflow now...');
  runWorkflow().catch(err => log(`Unhandled error: ${err.message}`));
} else {
  // Schedule: 7:00 AM Eastern daily
  log(`Scheduler started. Next run at 7:00 AM ET (${CONFIG.cronSchedule} ${CONFIG.cronTimezone})`);
  log('Run `node index.js --run-now` to trigger immediately.\n');

  cron.schedule(CONFIG.cronSchedule, () => {
    runWorkflow().catch(err => log(`Unhandled error: ${err.message}`));
  }, {
    timezone: CONFIG.cronTimezone,
  });
}
