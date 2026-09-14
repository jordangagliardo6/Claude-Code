/**
 * SW Michigan HVAC Lead Generation Workflow
 *
 * Searches Apollo.io for HVAC business owners in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends new leads.
 * Runs automatically at 7am Eastern via node-cron.
 *
 * Required env vars (see .env.example):
 *   APOLLO_API_KEY
 *   GOOGLE_CREDENTIALS_PATH   (path to service-account JSON file)
 *   GOOGLE_SPREADSHEET_ID
 *   SHEET_NAME                (tab name, default "Leads")
 *   NOTIFICATION_EMAIL        (receives error alerts)
 *
 * Optional env vars:
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS  (for email alerts)
 *   MAX_LEADS_PER_RUN         (default 25)
 *   DRY_RUN                   (set to "true" to log rows without writing)
 */

'use strict';

const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  // Modify this list freely to add/remove cities
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Priority order for job titles (first match wins per company)
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Apollo industry keyword tags to match
  industryTags: [
    'HVAC',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // Company size: 1–25 employees only
  employeeRanges: ['1,10', '11,25'],

  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  sheetName: process.env.SHEET_NAME || 'Leads',
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',
  credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
  dryRun: process.env.DRY_RUN === 'true',
};

// ─── Apollo Search ────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers across all configured cities.
 * Returns an array of raw Apollo person objects that have at least one phone number.
 */
async function searchApolloLeads() {
  const allPeople = [];
  const seenIds = new Set();

  for (const city of CONFIG.cities) {
    console.log(`[Apollo] Searching ${city}...`);

    try {
      const response = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        {
          person_titles: CONFIG.jobTitles,
          person_locations: [city],
          organization_locations: ['Michigan, United States'],
          q_organization_keyword_tags: CONFIG.industryTags,
          organization_num_employees_ranges: CONFIG.employeeRanges,
          person_seniorities: ['owner', 'founder', 'c_suite'],
          include_similar_titles: true,
          page: 1,
          per_page: 10,  // 10 per city × 7 cities gives room to trim to 25
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.APOLLO_API_KEY,
          },
          timeout: 15000,
        }
      );

      const people = response.data?.people || [];

      for (const person of people) {
        // Skip if no phone number at all
        const phones = person.phone_numbers || [];
        if (phones.length === 0) continue;

        // Deduplicate across city searches by Apollo person ID
        if (seenIds.has(person.id)) continue;
        seenIds.add(person.id);

        allPeople.push(person);
      }
    } catch (err) {
      // Log city-level errors but continue so one bad city doesn't kill the run
      const msg = err.response?.data?.message || err.message;
      console.error(`[Apollo] Error searching ${city}: ${msg}`);

      // Surface plan-access errors immediately so the user knows
      if (err.response?.status === 402 || err.response?.data?.error_code === 'API_INACCESSIBLE') {
        throw new Error(
          `Apollo plan does not include People Search. Upgrade at https://www.apollo.io/pricing`
        );
      }
    }
  }

  console.log(`[Apollo] Found ${allPeople.length} candidates with phone numbers.`);
  return allPeople;
}

// ─── Map Apollo person → sheet row ───────────────────────────────────────────

/**
 * Pick the best phone number: prefer mobile, then direct, then any.
 */
function pickPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return '';
  const mobile = phoneNumbers.find((p) => p.type === 'mobile');
  const direct = phoneNumbers.find((p) => p.type === 'direct');
  return (mobile || direct || phoneNumbers[0]).sanitized_number || '';
}

/**
 * Convert an Apollo person record into the 9-column row the sheet expects:
 * Date Added | Business Name | Owner First Name | Owner Last Name |
 * Phone Number | City | Website | Called | Notes
 */
function personToRow(person) {
  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const org = person.organization || person.account || {};
  const city =
    person.city ||
    org.city ||
    (person.location || '').split(',')[0]?.trim() ||
    '';

  const website =
    org.website_url || org.primary_domain
      ? `https://${org.primary_domain}`
      : '';

  return [
    today,                          // Date Added
    org.name || '',                 // Business Name
    person.first_name || '',        // Owner First Name
    person.last_name || '',         // Owner Last Name
    pickPhone(person.phone_numbers),// Phone Number
    city,                           // City
    website,                        // Website
    '',                             // Called (blank)
    '',                             // Notes (blank)
  ];
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Return a Set of lowercased business names already in the sheet so we can
 * skip duplicates. Reads column B (Business Name) from row 2 onward.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.flat().map((name) => name.trim().toLowerCase()));
}

/**
 * Append rows to the sheet in a single API call.
 */
async function appendLeadsToSheet(sheets, rows) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Ensure the header row exists (idempotent — only writes if the sheet is empty).
 */
async function ensureHeaderRow(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A1:I1`,
  });

  const header = res.data.values?.[0] || [];
  if (header.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${CONFIG.sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
          'Phone Number', 'City', 'Website', 'Called', 'Notes',
        ]],
      },
    });
    console.log('[Sheets] Header row created.');
  }
}

// ─── Error Notifications ──────────────────────────────────────────────────────

async function sendErrorNotification(error) {
  console.error('[ERROR]', error.message || error);

  // If SMTP credentials are not configured, a console log is enough
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('[Notify] SMTP not configured — error logged above. Set SMTP_* vars to enable email alerts.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: CONFIG.notificationEmail,
      subject: '[Lead Gen] ⚠️ Workflow Error — Manual Check Required',
      text: [
        `The HVAC lead generation workflow encountered an error on ${new Date().toISOString()}.`,
        '',
        'Error:',
        error.message || String(error),
        '',
        'Please check the server logs and rerun manually if needed.',
      ].join('\n'),
    });

    console.log(`[Notify] Error email sent to ${CONFIG.notificationEmail}`);
  } catch (mailErr) {
    console.error('[Notify] Failed to send error email:', mailErr.message);
  }
}

// ─── Main Workflow ────────────────────────────────────────────────────────────

async function runLeadGenWorkflow() {
  const startedAt = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Workflow] Started at ${startedAt}`);
  console.log(CONFIG.dryRun ? '[Workflow] DRY RUN — no rows will be written.' : '');

  try {
    // 1. Validate required config
    if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set.');
    if (!CONFIG.spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set.');

    // 2. Connect to Google Sheets
    console.log('[Sheets] Connecting...');
    const sheets = await getGoogleSheetsClient();
    await ensureHeaderRow(sheets);

    // 3. Load existing business names for dedup
    console.log('[Sheets] Loading existing entries...');
    const existing = await getExistingBusinessNames(sheets);
    console.log(`[Sheets] ${existing.size} existing businesses found.`);

    // 4. Search Apollo
    const candidates = await searchApolloLeads();

    if (candidates.length === 0) {
      console.log('[Workflow] Apollo returned no results with phone numbers. Nothing to add.');
      return;
    }

    // 5. Convert, deduplicate, and cap at maxLeadsPerRun
    const newRows = [];
    for (const person of candidates) {
      if (newRows.length >= CONFIG.maxLeadsPerRun) break;

      const row = personToRow(person);
      const bizName = row[1].trim().toLowerCase();

      if (!bizName) continue;                    // skip if no company name
      if (existing.has(bizName)) {
        console.log(`[Dedup] Skipping "${row[1]}" — already in sheet.`);
        continue;
      }

      newRows.push(row);
      existing.add(bizName);                     // prevent within-run duplicates
    }

    // 6. Write to sheet (or log in dry-run mode)
    if (newRows.length === 0) {
      console.log('[Workflow] All candidates already exist in the sheet. Nothing new to add.');
      return;
    }

    if (CONFIG.dryRun) {
      console.log(`[DRY RUN] Would append ${newRows.length} rows:`);
      newRows.forEach((r, i) => console.log(`  ${i + 1}. ${r[1]} (${r[5]}) — ${r[4]}`));
    } else {
      await appendLeadsToSheet(sheets, newRows);
      console.log(`[Workflow] ✅ Appended ${newRows.length} new leads to the sheet.`);
      newRows.forEach((r) => console.log(`  → ${r[1]} (${r[5]}) — ${r[4]}`));
    }

    console.log(`[Workflow] Finished at ${new Date().toISOString()}`);
  } catch (err) {
    await sendErrorNotification(err);
  }
}

// ─── Connectivity Check (used by setup script) ───────────────────────────────

async function checkConnections() {
  let apolloOk = false;
  let sheetsOk = false;

  // Test Apollo
  try {
    const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'x-api-key': process.env.APOLLO_API_KEY },
      timeout: 8000,
    });
    apolloOk = res.status === 200;
  } catch (e) {
    console.error('[Check] Apollo connection failed:', e.response?.data?.message || e.message);
  }

  // Test Google Sheets
  try {
    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.get({ spreadsheetId: CONFIG.spreadsheetId });
    sheetsOk = true;
  } catch (e) {
    console.error('[Check] Google Sheets connection failed:', e.message);
  }

  console.log('\n╔══════════════════════════════╗');
  console.log('║   Connection Check Results   ║');
  console.log('╠══════════════════════════════╣');
  console.log(`║  Apollo API   ${apolloOk ? '✅ Connected   ' : '❌ FAILED       '} ║`);
  console.log(`║  Google Sheets ${sheetsOk ? '✅ Connected   ' : '❌ FAILED       '} ║`);
  console.log('╚══════════════════════════════╝\n');

  return apolloOk && sheetsOk;
}

// ─── Entry Points ─────────────────────────────────────────────────────────────

const command = process.argv[2];

if (command === 'check') {
  // node index.js check
  require('dotenv').config();
  checkConnections().then((ok) => process.exit(ok ? 0 : 1));
} else if (command === 'run') {
  // node index.js run  →  one immediate run (no schedule)
  require('dotenv').config();
  runLeadGenWorkflow().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  // node index.js  →  start the cron scheduler
  console.log('[Scheduler] Starting HVAC lead gen cron.');
  console.log('[Scheduler] Job will fire every day at 7:00 AM Eastern time.');
  console.log('[Scheduler] Run "node index.js run" to trigger immediately.\n');

  // node-cron supports the timezone option directly
  cron.schedule('0 7 * * *', runLeadGenWorkflow, {
    timezone: 'America/New_York',
  });
}
