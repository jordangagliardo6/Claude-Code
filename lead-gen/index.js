/**
 * HVAC Lead Generation Workflow
 * Apollo.io → Google Sheets | Southwest Michigan HVAC companies
 *
 * Usage:
 *   node index.js              — start the cron scheduler (7 AM ET daily)
 *   node index.js --run-once   — run immediately and exit
 */

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// Configuration — edit these to change cities, titles, or size
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  // Southwest Michigan cities to target
  targetCities: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // Keywords Apollo will use to match company type
  industryKeywords: 'HVAC heating air conditioning plumbing mechanical contractor',

  // Job titles in priority order (Apollo returns ranked by this order)
  targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Company size range: 1–25 employees
  employeeRange: '1,25',

  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),

  // Spreadsheet columns in order
  columns: ['Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name', 'Phone Number', 'City', 'Website', 'Called', 'Notes'],
};

// ─────────────────────────────────────────────────────────────
// Apollo.io — search for HVAC contacts
// ─────────────────────────────────────────────────────────────

async function searchApolloLeads() {
  const url = 'https://api.apollo.io/api/v1/mixed_people/search';

  const payload = {
    api_key: process.env.APOLLO_API_KEY,

    // Search keywords to target HVAC/plumbing companies
    q_keywords: CONFIG.industryKeywords,

    // Target Michigan broadly so Apollo doesn't narrow too aggressively;
    // we post-filter by city below if needed
    person_locations: ['Michigan, United States'],

    person_titles: CONFIG.targetTitles,

    // 1–25 employees (owner-operated)
    organization_num_employees_ranges: [CONFIG.employeeRange],

    // Only return contacts that have at least one phone number
    contact_phone_number_status: ['mobile', 'direct'],

    per_page: CONFIG.maxLeadsPerRun,
    page: 1,
  };

  try {
    const { data } = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    if (!data || !data.people || !Array.isArray(data.people)) {
      console.log('[Apollo] No results returned. Response:', JSON.stringify(data, null, 2));
      return [];
    }

    console.log(`[Apollo] Found ${data.people.length} contacts (total matching: ${data.pagination?.total_entries ?? 'unknown'})`);
    return data.people;
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    throw new Error(`Apollo API error — ${msg}`);
  }
}

// Extract the best available phone number from an Apollo contact
function pickPhone(person) {
  // Prefer mobile → direct dial → any phone on record
  const mobile = person.contact?.phone_numbers?.find(p => p.type === 'mobile');
  if (mobile?.sanitized_number) return mobile.sanitized_number;

  const direct = person.contact?.phone_numbers?.find(p => p.type === 'direct');
  if (direct?.sanitized_number) return direct.sanitized_number;

  // Fallback: first phone on the contact
  const anyPhone = person.contact?.phone_numbers?.[0];
  if (anyPhone?.sanitized_number) return anyPhone.sanitized_number;

  // Last resort: organization phone
  return person.organization?.phone ?? '';
}

// Map a raw Apollo "person" object to our sheet row format
function mapPersonToRow(person) {
  const org = person.organization ?? {};
  const city = person.city ?? org.city ?? '';
  const phone = pickPhone(person);
  const website = org.website_url
    ? org.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : '';

  return {
    dateAdded: new Date().toLocaleDateString('en-US'),
    businessName: org.name ?? '',
    firstName: person.first_name ?? '',
    lastName: person.last_name ?? '',
    phone,
    city,
    website,
    called: '',
    notes: '',
  };
}

// ─────────────────────────────────────────────────────────────
// Google Sheets — read existing + append new rows
// ─────────────────────────────────────────────────────────────

function buildSheetsClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error(
      `Google credentials file not found at "${keyPath}". ` +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH in your .env file.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(keyPath),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function getExistingBusinessNames(sheets) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.SHEET_TAB_NAME || 'Leads';

  // Column B = Business Name (index 1 when zero-based, column B in sheets)
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    // Skip header row (row 1), read all of column B
    range: `${tab}!B2:B`,
  });

  const rows = data.values ?? [];
  // Return a Set of lowercased names for O(1) duplicate checks
  return new Set(rows.flat().map(name => (name ?? '').toLowerCase().trim()));
}

async function ensureHeaderRow(sheets) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.SHEET_TAB_NAME || 'Leads';

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:I1`,
  });

  const existingHeaders = (data.values?.[0] ?? []).join(',');
  const expectedHeaders = CONFIG.columns.join(',');

  if (existingHeaders !== expectedHeaders) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tab}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [CONFIG.columns] },
    });
    console.log('[Sheets] Header row written.');
  }
}

async function appendLeadsToSheet(sheets, rows) {
  if (rows.length === 0) {
    console.log('[Sheets] Nothing to append.');
    return 0;
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.SHEET_TAB_NAME || 'Leads';

  const values = rows.map(r => [
    r.dateAdded,
    r.businessName,
    r.firstName,
    r.lastName,
    r.phone,
    r.city,
    r.website,
    r.called,
    r.notes,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });

  console.log(`[Sheets] Appended ${rows.length} new lead(s).`);
  return rows.length;
}

// ─────────────────────────────────────────────────────────────
// Email notification on failure
// ─────────────────────────────────────────────────────────────

async function sendErrorAlert(errorMessage) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAIL } = process.env;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !ALERT_EMAIL) {
    console.error('[Alert] Email credentials not configured — skipping notification.');
    console.error('[Alert] Error was:', errorMessage);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: GMAIL_USER,
    to: ALERT_EMAIL,
    subject: `⚠️ HVAC Lead Gen Failed — ${new Date().toLocaleDateString()}`,
    text: [
      'Your automated HVAC lead generation run failed.',
      '',
      `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
      '',
      'Error:',
      errorMessage,
      '',
      'Check the server logs for more detail.',
    ].join('\n'),
  });

  console.log(`[Alert] Error notification sent to ${ALERT_EMAIL}`);
}

// ─────────────────────────────────────────────────────────────
// Main run function
// ─────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const runTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Run] Starting lead generation — ${runTime} ET`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // 1. Pull contacts from Apollo
    const people = await searchApolloLeads();

    if (people.length === 0) {
      console.log('[Run] Apollo returned 0 results. No leads added this run.');
      return;
    }

    // 2. Map to our row format, drop contacts with no phone
    const candidates = people
      .map(mapPersonToRow)
      .filter(r => r.phone.length > 0 && r.businessName.length > 0);

    console.log(`[Run] ${candidates.length} contacts have a phone number and business name`);

    // 3. Connect to Google Sheets and fetch existing business names
    const sheets = buildSheetsClient();
    await ensureHeaderRow(sheets);
    const existingNames = await getExistingBusinessNames(sheets);
    console.log(`[Sheets] ${existingNames.size} businesses already in the sheet`);

    // 4. Remove duplicates (by business name, case-insensitive)
    const newLeads = candidates.filter(
      r => !existingNames.has(r.businessName.toLowerCase().trim())
    );
    const skipped = candidates.length - newLeads.length;
    if (skipped > 0) console.log(`[Run] Skipped ${skipped} duplicate(s)`);

    // 5. Append new leads (up to MAX_LEADS_PER_RUN)
    const toWrite = newLeads.slice(0, CONFIG.maxLeadsPerRun);
    const added = await appendLeadsToSheet(sheets, toWrite);

    console.log(`[Run] Done — ${added} new lead(s) added, ${skipped} duplicate(s) skipped.`);

  } catch (err) {
    console.error('[Run] FAILED:', err.message);
    await sendErrorAlert(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Entry point — scheduled or one-shot
// ─────────────────────────────────────────────────────────────

function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

validateEnv();

if (process.argv.includes('--run-once')) {
  runLeadGeneration().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
  console.log(`[Scheduler] Starting. Next run scheduled via cron: "${schedule}" (TZ=${process.env.TZ || 'America/New_York'})`);

  cron.schedule(schedule, runLeadGeneration, {
    timezone: process.env.TZ || 'America/New_York',
  });

  console.log('[Scheduler] Running. Press Ctrl+C to stop.\n');

  // Run once immediately on startup so you can confirm everything works
  runLeadGeneration();
}
