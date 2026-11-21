/**
 * HVAC Lead Generation — Apollo.io → Google Sheets
 *
 * Searches Apollo.io for owner-operated HVAC businesses in Southwest Michigan,
 * appends new leads to a Google Sheet, and schedules itself to run at 7am Eastern daily.
 *
 * First-time setup:  npm install && node auth.js
 * Run once manually: node index.js --run-now
 * Start scheduler:   npm start
 */

require('dotenv').config();

const axios = require('axios');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ─── Config (edit these to change cities, titles, or column order) ─────────────

const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo keyword tags for HVAC / plumbing / mechanical industries
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating',
  'cooling',
  'air conditioning',
];

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

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1HuLNVmDhxJCVgLKT07w9a4SXOJRzbhYKWX9Ul9W-p3A';
const MAX_LEADS     = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

// ─── Google Sheets auth ────────────────────────────────────────────────────────

function getGoogleAuth() {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  const tokenPath       = path.join(__dirname, 'token.json');

  if (!fs.existsSync(credentialsPath)) {
    throw new Error('credentials.json not found. Run "node auth.js" first.');
  }
  if (!fs.existsSync(tokenPath)) {
    throw new Error('token.json not found. Run "node auth.js" first.');
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));

  // Auto-save refreshed tokens so the schedule never expires
  oAuth2Client.on('tokens', (tokens) => {
    const existing = JSON.parse(fs.readFileSync(tokenPath));
    fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });

  return oAuth2Client;
}

// ─── Sheets helpers ────────────────────────────────────────────────────────────

async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A1:I1',
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_HEADERS] },
    });
    console.log('[Sheets] Headers written.');
  }
}

/** Returns a Set of business names already in column B (lowercase, trimmed). */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!B2:B',
  });
  const rows = res.data.values || [];
  return new Set(rows.map((r) => (r[0] || '').trim().toLowerCase()));
}

async function appendRows(sheets, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Apollo.io search ─────────────────────────────────────────────────────────

/**
 * Calls Apollo.io People Search API and returns up to `limit` contacts
 * matching the SW Michigan HVAC criteria.
 */
async function searchApolloLeads(limit) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in .env');

  const payload = {
    page: 1,
    per_page: Math.min(limit, 25), // Apollo max per page
    person_titles: TARGET_TITLES,
    person_locations: SW_MICHIGAN_CITIES,
    // 1–25 employees (owner-operated small businesses)
    organization_num_employees_ranges: ['1,25'],
    // Keyword match on industry — Apollo uses q_organization_keyword_tags
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    // Only return contacts that have at least one phone number
    contact_phone_number_status: ['verified', 'guessed'],
  };

  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      timeout: 30_000,
    }
  );

  const people = response.data?.people || [];
  console.log(`[Apollo] ${people.length} contacts returned from search.`);
  return people;
}

/** Picks the best phone number from Apollo's phone_numbers array. */
function pickPhone(person) {
  const phones = person.phone_numbers || [];
  // Prefer mobile, then direct, then any
  const priority = ['mobile', 'direct', 'work_hq', 'other'];
  for (const type of priority) {
    const match = phones.find((p) => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to raw_number
  if (phones[0]?.raw_number) return phones[0].raw_number;
  return '';
}

/** Converts an Apollo contact record into a row array matching SHEET_HEADERS. */
function toSheetRow(person) {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const org     = person.organization || {};
  const city    = person.city || org.city || '';
  const website = org.website_url || '';
  const phone   = pickPhone(person);

  return [
    today,                              // Date Added
    org.name || '',                     // Business Name
    person.first_name || '',            // Owner First Name
    person.last_name || '',             // Owner Last Name
    phone,                              // Phone Number
    city,                               // City
    website,                            // Website
    '',                                 // Called (blank)
    '',                                 // Notes (blank)
  ];
}

// ─── Error notifications ───────────────────────────────────────────────────────

async function sendErrorAlert(subject, body) {
  const to       = process.env.ALERT_EMAIL_TO;
  const from     = process.env.ALERT_EMAIL_FROM;
  const password = process.env.GMAIL_APP_PASSWORD;

  // Always log to console
  console.error(`[ERROR] ${subject}\n${body}`);

  if (!to || !password) {
    console.warn('[Alert] ALERT_EMAIL_TO or GMAIL_APP_PASSWORD not set — skipping email alert.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: from, pass: password },
    });

    await transporter.sendMail({
      from,
      to,
      subject: `[Lead Gen Alert] ${subject}`,
      text: `${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });
    console.log(`[Alert] Email sent to ${to}`);
  } catch (err) {
    console.error('[Alert] Failed to send email:', err.message);
  }
}

// ─── Main run logic ───────────────────────────────────────────────────────────

async function runLeadGen() {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[LeadGen] Starting run at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log(`${'─'.repeat(60)}`);

  let sheetsClient;

  // Step 1 — Authorize Google Sheets
  try {
    const auth = getGoogleAuth();
    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('[Sheets] Authorized.');
  } catch (err) {
    await sendErrorAlert('Google Sheets auth failed', err.message);
    return;
  }

  // Step 2 — Ensure header row exists
  try {
    await ensureHeaders(sheetsClient);
  } catch (err) {
    await sendErrorAlert('Failed to write sheet headers', err.message);
    return;
  }

  // Step 3 — Load existing business names for deduplication
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheetsClient);
    console.log(`[Sheets] ${existingNames.size} existing businesses loaded for dedup check.`);
  } catch (err) {
    await sendErrorAlert('Failed to read existing sheet data', err.message);
    return;
  }

  // Step 4 — Search Apollo.io
  let apolloContacts;
  try {
    apolloContacts = await searchApolloLeads(MAX_LEADS * 2); // fetch extra to account for dupes/no-phone
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    await sendErrorAlert('Apollo.io search failed', detail);
    return;
  }

  if (apolloContacts.length === 0) {
    await sendErrorAlert('Apollo returned 0 results', 'The search returned no contacts. Check your API key and filters.');
    return;
  }

  // Step 5 — Filter and deduplicate
  const newRows = [];
  let skippedDupe  = 0;
  let skippedPhone = 0;

  for (const person of apolloContacts) {
    if (newRows.length >= MAX_LEADS) break;

    const phone = pickPhone(person);
    if (!phone) {
      skippedPhone++;
      continue;
    }

    const bizName = (person.organization?.name || '').trim();
    if (!bizName || existingNames.has(bizName.toLowerCase())) {
      skippedDupe++;
      continue;
    }

    newRows.push(toSheetRow(person));
    existingNames.add(bizName.toLowerCase()); // prevent dupes within this batch
  }

  console.log(`[Filter] ${newRows.length} new leads | ${skippedDupe} dupes skipped | ${skippedPhone} no-phone skipped`);

  // Step 6 — Append to sheet
  if (newRows.length === 0) {
    console.log('[Sheets] No new leads to add this run.');
    return;
  }

  try {
    await appendRows(sheetsClient, newRows);
    console.log(`[Sheets] ✓ ${newRows.length} leads appended to spreadsheet.`);
    console.log(`[Sheets] View: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  } catch (err) {
    await sendErrorAlert('Failed to write leads to Google Sheets', err.message);
    return;
  }

  console.log(`[LeadGen] Run complete.\n`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // Manual single run (node index.js --run-now)
  runLeadGen().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
} else {
  // Scheduled mode — run at CRON_SCHEDULE in Eastern Time
  console.log(`[Scheduler] Lead gen scheduled: "${CRON_SCHEDULE}" (America/New_York)`);
  console.log('[Scheduler] Waiting for next scheduled run. Use --run-now to trigger immediately.\n');

  cron.schedule(CRON_SCHEDULE, runLeadGen, {
    timezone: 'America/New_York',
  });
}
