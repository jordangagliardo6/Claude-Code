/**
 * HVAC Lead Generation Workflow
 * Searches Apollo.io for HVAC companies in Southwest Michigan and appends
 * new leads (no duplicates) to a Google Sheets spreadsheet via Google Drive API.
 *
 * Required env vars:
 *   APOLLO_API_KEY        – Apollo.io API key
 *   GOOGLE_SHEET_ID       – ID of the target Google Sheet (from the URL)
 *   GOOGLE_SERVICE_ACCOUNT_JSON – Full JSON of service-account credentials (as a single-line string)
 *                                 OR set GOOGLE_APPLICATION_CREDENTIALS to the file path.
 *
 * Schedule: runs every morning at 7:00 AM Eastern via node-cron.
 * Max leads per run: 25.
 */

'use strict';

const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  // Apollo search settings
  apolloApiKey: process.env.APOLLO_API_KEY,
  maxLeadsPerRun: 25,

  // Target cities / areas in Southwest Michigan
  targetLocations: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Job titles to search for (in priority order)
  targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Apollo industry keyword tags
  industryKeywords: ['hvac', 'heating and air conditioning', 'plumbing', 'mechanical contracting'],

  // Company size: 1–25 employees
  employeeRange: '1,25',

  // Google Sheets settings
  sheetId: process.env.GOOGLE_SHEET_ID,
  sheetName: 'Leads', // tab name inside the spreadsheet

  // Notification email (used for error logs)
  notifyEmail: 'jgagliardo98@gmail.com',
};

// ─── Google Sheets Auth ───────────────────────────────────────────────────────

function getGoogleAuth() {
  // Supports either a JSON string in env or a file path
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path
  return new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── Apollo Search ────────────────────────────────────────────────────────────

/**
 * Search Apollo for people matching our HVAC / SW Michigan criteria.
 * Returns raw Apollo person objects.
 */
async function searchApollo(page = 1) {
  const url = 'https://api.apollo.io/v1/mixed_people/search';

  const payload = {
    api_key: CONFIG.apolloApiKey,
    page,
    per_page: CONFIG.maxLeadsPerRun,
    person_titles: CONFIG.targetTitles,
    person_locations: CONFIG.targetLocations,
    organization_locations: ['Michigan, United States'],
    organization_num_employees_ranges: [CONFIG.employeeRange],
    q_organization_keyword_tags: CONFIG.industryKeywords,
    // Only return contacts that have a phone number
    contact_email_status: [], // not filtering by email
    person_seniorities: ['owner', 'c_suite', 'founder'],
  };

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  return response.data?.people ?? [];
}

/**
 * Enrich a person record to get their phone number and full name.
 * Apollo's search results mask last names and omit phones — enrichment reveals them.
 */
async function enrichPerson(personId) {
  const url = 'https://api.apollo.io/v1/people/match';

  const response = await axios.post(
    url,
    { api_key: CONFIG.apolloApiKey, id: personId, reveal_personal_emails: false },
    { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 },
  );

  return response.data?.person ?? null;
}

// ─── Google Sheets Helpers ────────────────────────────────────────────────────

const SHEET_COLUMNS = [
  'Date Added',      // A
  'Business Name',   // B
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H  (left blank)
  'Notes',           // I  (left blank)
];

/**
 * Fetch all existing business names from the sheet (column B) to prevent duplicates.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.sheetId,
    range: `${CONFIG.sheetName}!B2:B`,
  });

  const rows = res.data.values ?? [];
  return new Set(rows.flat().map((n) => n.trim().toLowerCase()));
}

/**
 * Ensure the header row exists; create the sheet tab if missing.
 */
async function ensureHeader(sheets) {
  let headerOk = false;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.sheetId,
      range: `${CONFIG.sheetName}!A1:I1`,
    });
    const row = res.data.values?.[0] ?? [];
    headerOk = row.length === SHEET_COLUMNS.length;
  } catch (_) {
    // Sheet tab doesn't exist yet — create it first
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: CONFIG.sheetName } } }],
      },
    });
  }

  if (!headerOk) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.sheetId,
      range: `${CONFIG.sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS] },
    });
    console.log('[setup] Header row written.');
  }
}

/**
 * Append rows to the sheet.
 */
async function appendRows(sheets, rows) {
  if (rows.length === 0) return;

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.sheetId,
    range: `${CONFIG.sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Lead Extraction ──────────────────────────────────────────────────────────

/**
 * Extract and normalise the phone number from an enriched person record.
 * Prefers direct / mobile numbers over other types.
 */
function extractPhone(person) {
  const phones = person?.phone_numbers ?? [];

  const priority = ['direct', 'mobile', 'other', 'work'];
  for (const type of priority) {
    const match = phones.find((p) => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to any available raw number
  if (phones.length > 0) return phones[0].sanitized_number ?? phones[0].raw_number ?? '';
  return '';
}

/**
 * Convert an Apollo person record into a spreadsheet row array.
 */
function personToRow(person, today) {
  const org = person.organization ?? {};
  const phone = extractPhone(person);

  return [
    today,                                    // Date Added
    org.name ?? '',                           // Business Name
    person.first_name ?? '',                  // Owner First Name
    person.last_name ?? '',                   // Owner Last Name
    phone,                                    // Phone Number
    person.city ?? org.city ?? '',            // City
    org.website_url ?? org.primary_domain ?? '', // Website
    '',                                       // Called (blank)
    '',                                       // Notes (blank)
  ];
}

// ─── Error notification ───────────────────────────────────────────────────────

/**
 * Logs an error clearly. In production you'd swap this body for an email/SMS
 * via SendGrid, Twilio, etc. For now it writes a structured console error so
 * any monitoring tool (PM2, CloudWatch, etc.) can capture it.
 */
function notifyError(context, error) {
  const msg = {
    level: 'ERROR',
    timestamp: new Date().toISOString(),
    context,
    message: error?.message ?? String(error),
    stack: error?.stack,
    notifyEmail: CONFIG.notifyEmail,
  };
  console.error(JSON.stringify(msg, null, 2));
  // TODO: Replace the line below with a real email/SMS call when you have an
  // outbound email service configured (e.g. SendGrid, AWS SES, Nodemailer).
  console.error(`[ALERT] Check manually — ${context}. Recipient: ${CONFIG.notifyEmail}`);
}

// ─── Main Run ─────────────────────────────────────────────────────────────────

async function runLeadGen() {
  console.log(`[run] Starting HVAC lead generation at ${new Date().toISOString()}`);

  // Validate config
  if (!CONFIG.apolloApiKey) {
    notifyError('startup', new Error('APOLLO_API_KEY is not set'));
    return;
  }
  if (!CONFIG.sheetId) {
    notifyError('startup', new Error('GOOGLE_SHEET_ID is not set'));
    return;
  }

  // ── Step 1: Auth + sheet setup ────────────────────────────────────────────
  let sheets;
  try {
    const auth = getGoogleAuth();
    sheets = google.sheets({ version: 'v4', auth });
    await ensureHeader(sheets);
  } catch (err) {
    notifyError('Google Sheets auth / header setup', err);
    return;
  }

  // ── Step 2: Load existing business names to de-dupe ──────────────────────
  let existing;
  try {
    existing = await getExistingBusinessNames(sheets);
    console.log(`[run] ${existing.size} existing businesses already in sheet.`);
  } catch (err) {
    notifyError('Reading existing sheet data', err);
    return;
  }

  // ── Step 3: Search Apollo ─────────────────────────────────────────────────
  let apolloPeople;
  try {
    apolloPeople = await searchApollo(1);
    console.log(`[apollo] Raw results returned: ${apolloPeople.length}`);
  } catch (err) {
    notifyError('Apollo people search', err);
    return;
  }

  if (apolloPeople.length === 0) {
    console.log('[apollo] No results returned. Nothing to write.');
    notifyError('Apollo search returned zero results', new Error('No HVAC leads found for SW Michigan this run'));
    return;
  }

  // ── Step 4: Enrich + filter ───────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const newRows = [];

  for (const person of apolloPeople) {
    if (newRows.length >= CONFIG.maxLeadsPerRun) break;

    const bizName = (person.organization?.name ?? '').trim();
    if (!bizName) continue;

    // Skip duplicates
    if (existing.has(bizName.toLowerCase())) {
      console.log(`[dedup] Skipping duplicate: ${bizName}`);
      continue;
    }

    // Enrich to get phone number
    let enriched = person;
    try {
      const full = await enrichPerson(person.id);
      if (full) enriched = full;
    } catch (err) {
      console.warn(`[enrich] Could not enrich ${person.id}: ${err.message}`);
      // Proceed with unmasked data we already have; phone may be empty
    }

    const phone = extractPhone(enriched);
    if (!phone) {
      console.log(`[filter] Skipping ${bizName} — no phone number.`);
      continue;
    }

    const row = personToRow(enriched, today);
    newRows.push(row);
    existing.add(bizName.toLowerCase()); // prevent in-run dups
    console.log(`[lead] Added: ${bizName} | ${phone}`);
  }

  // ── Step 5: Write to sheet ────────────────────────────────────────────────
  if (newRows.length === 0) {
    console.log('[run] No new qualifying leads this run (all duplicates or no phone).');
    return;
  }

  try {
    await appendRows(sheets, newRows);
    console.log(`[run] ✓ Appended ${newRows.length} new lead(s) to the spreadsheet.`);
  } catch (err) {
    notifyError('Google Sheets append failed', err);
    return;
  }

  console.log(`[run] Done. ${newRows.length} lead(s) added.`);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

// 7:00 AM Eastern — cron timezone support requires node-cron ≥ 3.x
cron.schedule('0 7 * * *', runLeadGen, { timezone: 'America/New_York' });

console.log('[scheduler] HVAC lead-gen scheduled for 07:00 AM Eastern every day.');
console.log('[scheduler] Run `node lead-gen.js --now` to trigger immediately for testing.');

// Allow a manual one-shot run: node lead-gen.js --now
if (process.argv.includes('--now')) {
  runLeadGen().catch((err) => {
    notifyError('Manual --now run', err);
    process.exit(1);
  });
}
