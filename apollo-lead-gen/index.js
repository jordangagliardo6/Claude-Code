#!/usr/bin/env node
/**
 * Apollo.io → Google Sheets Lead Generation
 *
 * Searches Apollo.io for HVAC/HVAC-adjacent owner-operated businesses in
 * Southwest Michigan and appends new contacts (max 25/run) to a Google Sheet.
 *
 * Usage:
 *   node index.js            start the cron scheduler (runs at 7am ET daily)
 *   node index.js --run-now  skip the schedule and run once immediately
 *   node index.js --setup    walk through the one-time Google OAuth2 flow
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

// ─── Configuration ────────────────────────────────────────────────────────────
// Edit these arrays to change which cities, industries, or titles are targeted.

const CONFIG = {
  // Southwest Michigan cities — add or remove as needed
  CITIES: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Industries passed to Apollo as keyword filters
  INDUSTRY_KEYWORDS: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Job titles to target, in priority order (Apollo returns them ranked by title match)
  JOB_TITLES: ['owner', 'president', 'founder', 'co-founder', 'general manager'],

  // Max employees (owner-operated small businesses only)
  MAX_EMPLOYEES: 25,

  // How many leads to pull per scheduled run
  MAX_LEADS_PER_RUN: 25,

  // Google Sheet column layout — change order here if you rearrange your sheet
  COLUMNS: ['Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name', 'Phone Number', 'City', 'Website', 'Called', 'Notes'],

  // Cron schedule: 7:00am Eastern Time every day
  CRON_SCHEDULE: '0 7 * * *',
  CRON_TIMEZONE: 'America/New_York',
};

// Google OAuth2 — token file is written next to credentials.json after first auth
const CREDENTIALS_PATH = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json');
const TOKEN_PATH = path.resolve(path.dirname(CREDENTIALS_PATH), 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── Apollo.io API ────────────────────────────────────────────────────────────

async function fetchApolloLeads(maxLeads) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in your .env file.');

  // Apollo's people-search endpoint
  const url = 'https://api.apollo.io/v1/mixed_people/search';

  // Build city-scoped location strings Apollo understands
  const locationFilters = CONFIG.CITIES.map(city => `${city}, michigan, united states`);

  const payload = {
    api_key: apiKey,
    per_page: Math.min(maxLeads, 25), // Apollo max per page is 25 on free/basic
    page: 1,
    person_titles: CONFIG.JOB_TITLES,
    person_locations: locationFilters,
    organization_num_employees_ranges: [`1,${CONFIG.MAX_EMPLOYEES}`],
    // Keyword search covers all four industry variants
    q_keywords: CONFIG.INDUSTRY_KEYWORDS.join(' OR '),
    // Request only contacts in the United States
    q_person_location_country_name: ['United States'],
  };

  console.log(`[Apollo] Searching for up to ${maxLeads} leads in SW Michigan…`);

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    timeout: 30_000,
  });

  const people = response.data?.people || [];
  console.log(`[Apollo] Returned ${people.length} contact(s).`);
  return people;
}

// Extract the fields we care about from an Apollo person record
function normalizeContact(person) {
  const org = person.organization || {};

  // Pick the best available phone — prefer mobile/direct over business line
  const phones = person.phone_numbers || [];
  const mobileOrDirect = phones.find(p => p.type === 'mobile' || p.type === 'direct_phone');
  const anyPhone = phones[0];
  const phone = (mobileOrDirect || anyPhone)?.sanitized_number || '';

  return {
    dateAdded: new Date().toLocaleDateString('en-US'),
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone,
    city: (person.city || org.city || '').trim(),
    website: (org.website_url || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
  };
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Google credentials file not found at ${CREDENTIALS_PATH}.\n` +
      `Run  node index.js --setup  to walk through the one-time OAuth flow.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    // Refresh proactively when < 5 minutes remain
    oAuth2Client.on('tokens', updated => fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated)));
    return oAuth2Client;
  }

  throw new Error(
    `Google token not found at ${TOKEN_PATH}.\n` +
    `Run  node index.js --setup  to authorize access to your Google Sheet.`
  );
}

// Returns a Set of business names already in the sheet (column B, 0-indexed = col 1)
async function getExistingBusinessNames(sheets) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!B2:B`,  // Business Name is column B
  });

  const rows = res.data.values || [];
  const names = new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
  console.log(`[Sheets] Found ${names.size} existing business name(s) — will skip duplicates.`);
  return names;
}

// Appends an array of normalized contacts to the sheet
async function appendLeads(sheets, contacts) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const rows = contacts.map(c => [
    c.dateAdded,    // Date Added
    c.businessName, // Business Name
    c.firstName,    // Owner First Name
    c.lastName,     // Owner Last Name
    c.phone,        // Phone Number
    c.city,         // City
    c.website,      // Website
    '',             // Called  (left blank for manual use)
    '',             // Notes   (left blank for manual use)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new lead(s).`);
}

// Ensures row 1 has the correct headers; writes them only if the sheet is empty
async function ensureHeaders(sheets) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:I1`,
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tab}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [CONFIG.COLUMNS] },
    });
    console.log('[Sheets] Headers written to row 1.');
  }
}

// ─── Error notifications ──────────────────────────────────────────────────────

async function sendErrorEmail(subject, body) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to || !process.env.SMTP_HOST) return; // email not configured — skip silently

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: `[Lead Gen] ${subject}`,
      text: body,
    });
    console.log(`[Email] Error notification sent to ${to}.`);
  } catch (err) {
    console.error('[Email] Failed to send notification email:', err.message);
  }
}

// ─── Main workflow ────────────────────────────────────────────────────────────

async function run() {
  const timestamp = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Lead Gen] Run started at ${timestamp}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // 1. Build the Google Sheets client
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // 2. Ensure the header row exists
    await ensureHeaders(sheets);

    // 3. Load existing business names for dedup
    const existing = await getExistingBusinessNames(sheets);

    // 4. Fetch leads from Apollo.io (over-fetch slightly to account for filtering)
    const rawPeople = await fetchApolloLeads(CONFIG.MAX_LEADS_PER_RUN + 10);

    if (rawPeople.length === 0) {
      const msg = 'Apollo returned 0 results. Check your API key, quota, and filter settings.';
      console.warn('[Lead Gen] WARNING:', msg);
      await sendErrorEmail('Apollo returned 0 results', msg);
      return;
    }

    // 5. Normalize, filter duplicates and contacts without a phone number
    const newLeads = rawPeople
      .map(normalizeContact)
      .filter(c => c.phone)                                           // must have phone
      .filter(c => c.businessName)                                    // must have company name
      .filter(c => !existing.has(c.businessName.toLowerCase().trim())) // skip duplicates
      .slice(0, CONFIG.MAX_LEADS_PER_RUN);                           // cap at 25

    console.log(`[Lead Gen] ${newLeads.length} new, unique lead(s) with phone numbers.`);

    if (newLeads.length === 0) {
      console.log('[Lead Gen] Nothing new to add — all results are either duplicates or missing phone numbers.');
      return;
    }

    // 6. Write to Google Sheets
    await appendLeads(sheets, newLeads);

    console.log(`[Lead Gen] Done. ${newLeads.length} lead(s) added to your sheet.`);
  } catch (err) {
    const msg = err.message || String(err);
    console.error('[Lead Gen] FATAL ERROR:', msg);
    await sendErrorEmail('Run failed', `Error at ${timestamp}:\n\n${msg}\n\n${err.stack || ''}`);
    process.exitCode = 1;
  }
}

// ─── One-time Google OAuth2 setup ────────────────────────────────────────────

async function setup() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`\nERROR: credentials.json not found at ${CREDENTIALS_PATH}`);
    console.log(`
Steps to get it:
  1. Go to https://console.cloud.google.com/
  2. Create a project (or select an existing one)
  3. Enable the Google Sheets API
  4. Go to APIs & Services → Credentials
  5. Create an OAuth 2.0 Client ID → type: Desktop App
  6. Download the JSON and save it as:  ${CREDENTIALS_PATH}
  7. Re-run:  node index.js --setup
`);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\nOpen this URL in your browser and authorize access to Google Sheets:\n');
  console.log(authUrl);
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste the authorization code here: ', async code => {
    rl.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      oAuth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log(`\nSuccess! Token saved to ${TOKEN_PATH}`);
      console.log('\nNow run  node index.js --run-now  to verify everything is connected.');
    } catch (err) {
      console.error('Failed to exchange code for token:', err.message);
      process.exit(1);
    }
  });
}

// ─── Verification run ─────────────────────────────────────────────────────────
// Called when run with --run-now. Runs the full workflow once and prints a
// connection summary so you can confirm both APIs are working before the first
// scheduled run fires.

async function verify() {
  console.log('\n' + '═'.repeat(60));
  console.log('  VERIFICATION RUN — testing Apollo.io + Google Sheets');
  console.log('═'.repeat(60));

  // Check env vars
  const missing = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your values.\n');
    process.exit(1);
  }

  console.log(`\n✓  APOLLO_API_KEY    set (${process.env.APOLLO_API_KEY.slice(0, 6)}…)`);
  console.log(`✓  GOOGLE_SHEET_ID   ${process.env.GOOGLE_SHEET_ID}`);
  console.log(`✓  Sheet tab          ${process.env.GOOGLE_SHEET_TAB || 'Sheet1'}`);
  if (process.env.NOTIFICATION_EMAIL) {
    console.log(`✓  Error emails →    ${process.env.NOTIFICATION_EMAIL}`);
  }

  console.log('\nRunning workflow now…\n');
  await run();
  console.log('\nVerification complete. If leads appeared in your sheet, you are ready to go.');
  console.log(`The scheduler will fire at 7:00am Eastern Time every morning.\n`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--setup')) {
  setup();
} else if (args.includes('--run-now')) {
  verify();
} else {
  // Start the cron scheduler
  console.log(`[Lead Gen] Scheduler started — will run at 7:00am Eastern Time every morning.`);
  console.log(`[Lead Gen] Run  node index.js --run-now  to test it immediately.\n`);

  cron.schedule(CONFIG.CRON_SCHEDULE, run, { timezone: CONFIG.CRON_TIMEZONE });

  // Keep the process alive
  process.stdin.resume();
}
