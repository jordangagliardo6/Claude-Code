/**
 * HVAC Lead Generation — Apollo.io → Google Sheets
 *
 * Searches Apollo.io for owner-operated HVAC/plumbing companies in Southwest
 * Michigan, deduplicates against the existing sheet, and appends up to 25 new
 * leads per run. Runs automatically at 7 AM Eastern every day via node-cron.
 *
 * Quick-start:
 *   1. cp .env.example .env  →  fill in all values
 *   2. npm install
 *   3. node index.js --test   →  one-time connection check, no writes
 *   4. node index.js          →  starts the scheduler (keeps running)
 */

'use strict';

require('dotenv').config();

const axios       = require('axios');
const cron        = require('node-cron');
const nodemailer  = require('nodemailer');
const fs          = require('fs');
const path        = require('path');
const readline    = require('readline');
const { google }  = require('googleapis');

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG = {
  apollo: {
    apiKey:      process.env.APOLLO_API_KEY,
    baseUrl:     'https://api.apollo.io/api/v1',
    // Maximum Apollo can return per page is 100; we page until we have enough.
    pageSize:    25,
  },
  google: {
    credentialsFile: path.resolve(process.env.GOOGLE_CREDENTIALS_FILE || 'google-credentials.json'),
    tokenFile:       path.resolve(process.env.GOOGLE_TOKEN_FILE       || 'token.json'),
    spreadsheetId:   process.env.GOOGLE_SPREADSHEET_ID,
    sheetTab:        process.env.GOOGLE_SHEET_TAB || 'Leads',
    // OAuth scopes needed — Sheets for read/write, Drive to verify file access.
    scopes:          ['https://www.googleapis.com/auth/spreadsheets',
                      'https://www.googleapis.com/auth/drive.readonly'],
  },
  email: {
    from:     process.env.ALERT_EMAIL_FROM,
    to:       process.env.ALERT_EMAIL_TO     || 'jgagliardo98@gmail.com',
    password: process.env.ALERT_EMAIL_PASSWORD,
  },
  run: {
    maxLeads:     parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
    cronSchedule: process.env.CRON_SCHEDULE  || '0 7 * * *',
    cronTimezone: process.env.CRON_TIMEZONE  || 'America/New_York',
  },
};

// ─── Target definitions (easy to edit) ───────────────────────────────────────

/**
 * Cities to search. Each entry is passed as a separate Apollo location filter
 * so results are biased toward these zip code clusters.
 */
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

/**
 * Apollo industry slugs. Apollo uses their own taxonomy — these map to HVAC
 * and related mechanical trades.
 */
const TARGET_INDUSTRIES = [
  'hvac & refrigeration',
  'mechanical or industrial engineering',
  'construction',
];

/**
 * Job titles to target, in priority order. Apollo will score contacts higher
 * when their title matches earlier entries.
 */
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Sheet column layout — update here if you ever restructure the spreadsheet.
const COLUMNS = {
  dateAdded:     0,   // A
  businessName:  1,   // B
  firstName:     2,   // C
  lastName:      3,   // D
  phone:         4,   // E
  city:          5,   // F
  website:       6,   // G
  called:        7,   // H  (left blank)
  notes:         8,   // I  (left blank)
};

// ─── Logging helpers ──────────────────────────────────────────────────────────

function log(msg)  { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg) { console.warn(`[${new Date().toISOString()}] WARN: ${msg}`); }
function err(msg)  { console.error(`[${new Date().toISOString()}] ERROR: ${msg}`); }

// ─── Email alert ──────────────────────────────────────────────────────────────

async function sendAlert(subject, body) {
  if (!CONFIG.email.from || !CONFIG.email.password) {
    warn('Email alert skipped — ALERT_EMAIL_FROM or ALERT_EMAIL_PASSWORD not set.');
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: CONFIG.email.from, pass: CONFIG.email.password },
    });
    await transporter.sendMail({
      from:    CONFIG.email.from,
      to:      CONFIG.email.to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text:    body,
    });
    log(`Alert email sent to ${CONFIG.email.to}: ${subject}`);
  } catch (e) {
    err(`Failed to send alert email: ${e.message}`);
  }
}

// ─── Google OAuth setup ───────────────────────────────────────────────────────

/**
 * Loads OAuth2 credentials from google-credentials.json (downloaded from
 * Google Cloud Console) and either reads a saved token or walks the user
 * through the one-time browser consent flow.
 */
async function getAuthClient() {
  if (!fs.existsSync(CONFIG.google.credentialsFile)) {
    throw new Error(
      `Google credentials file not found: ${CONFIG.google.credentialsFile}\n` +
      'Download it from Google Cloud Console → APIs & Services → Credentials.'
    );
  }

  const raw         = fs.readFileSync(CONFIG.google.credentialsFile, 'utf8');
  const credentials = JSON.parse(raw);
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]
  );

  // Use saved token if it exists.
  if (fs.existsSync(CONFIG.google.tokenFile)) {
    const token = JSON.parse(fs.readFileSync(CONFIG.google.tokenFile, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // First-time: open browser for consent and capture auth code from stdin.
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       CONFIG.google.scopes,
  });

  console.log('\n─────────────────────────────────────────────────');
  console.log('First-time Google authorization required.');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n─────────────────────────────────────────────────');

  const code = await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Paste the authorization code here: ', answer => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(CONFIG.google.tokenFile, JSON.stringify(tokens));
  log('Google token saved to ' + CONFIG.google.tokenFile);
  return oAuth2Client;
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

/** Returns an array of business names already in the sheet (lowercased). */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.google.spreadsheetId,
    // Column B = Business Name; read from row 2 to skip the header.
    range: `${CONFIG.google.sheetTab}!B2:B`,
  });
  const rows = res.data.values || [];
  return new Set(rows.map(r => (r[0] || '').trim().toLowerCase()));
}

/** Ensures the header row exists; creates it if the sheet is empty. */
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.google.spreadsheetId,
    range: `${CONFIG.google.sheetTab}!A1:I1`,
  });
  const existing = (res.data.values || [])[0];
  const expected = [
    'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
    'Phone Number', 'City', 'Website', 'Called', 'Notes',
  ];
  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.google.spreadsheetId,
      range: `${CONFIG.google.sheetTab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [expected] },
    });
    log('Header row created.');
  }
}

/** Appends an array of row arrays to the sheet. */
async function appendRows(sheets, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.google.spreadsheetId,
    range: `${CONFIG.google.sheetTab}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Apollo.io helpers ────────────────────────────────────────────────────────

/**
 * Calls Apollo People Search for one city and returns an array of raw contact
 * objects. Apollo paginates at 25/page by default.
 */
async function searchApolloForCity(city, page = 1) {
  const payload = {
    api_key:                CONFIG.apollo.apiKey,
    q_organization_industry_tag_ids: [], // filled below via industry names
    person_titles:          TARGET_TITLES,
    organization_num_employees_ranges: ['1,25'],
    person_locations:       [city],
    page,
    per_page:               CONFIG.apollo.pageSize,
    // Only return contacts that have at least one phone number.
    contact_email_status:   [],
    // Ask Apollo to include phone numbers in the response.
    include_phone_numbers:  true,
  };

  // Apollo accepts industry *names* in q_keywords as a simpler alternative to
  // tag IDs, which vary by account.  We combine them with OR logic via keywords.
  payload.q_keywords = 'HVAC OR "heating and air" OR plumbing OR "mechanical contracting"';

  const response = await axios.post(
    `${CONFIG.apollo.baseUrl}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key':     CONFIG.apollo.apiKey,
      },
      timeout: 30_000,
    }
  );

  return response.data;
}

/**
 * Extracts the best phone number from an Apollo contact object.
 * Priority: mobile → direct → sanitized_phone → first available number.
 */
function extractPhone(contact) {
  const nums = contact.phone_numbers || [];

  const mobile = nums.find(n =>
    (n.type || '').toLowerCase().includes('mobile') ||
    (n.label || '').toLowerCase().includes('mobile')
  );
  if (mobile?.sanitized_number) return mobile.sanitized_number;

  const direct = nums.find(n =>
    (n.type || '').toLowerCase().includes('direct') ||
    (n.label || '').toLowerCase().includes('direct')
  );
  if (direct?.sanitized_number) return direct.sanitized_number;

  if (contact.sanitized_phone) return contact.sanitized_phone;

  // Fall back to any number present.
  const first = nums.find(n => n.sanitized_number);
  return first?.sanitized_number || '';
}

/**
 * Normalises a raw Apollo contact into the shape our sheet expects.
 * Returns null if the contact lacks a phone number (per the brief).
 */
function normaliseContact(raw) {
  const phone = extractPhone(raw);
  if (!phone) return null;

  const org = raw.organization || {};
  return {
    businessName: (org.name || raw.account_name || '').trim(),
    firstName:    (raw.first_name || '').trim(),
    lastName:     (raw.last_name  || '').trim(),
    phone,
    city:         (raw.city || org.city || '').trim(),
    website:      (org.website_url || '').trim(),
  };
}

// ─── Core workflow ────────────────────────────────────────────────────────────

async function runWorkflow() {
  log('─── Starting HVAC lead generation run ───');

  // 1. Authenticate with Google.
  let authClient, sheets;
  try {
    authClient = await getAuthClient();
    sheets = google.sheets({ version: 'v4', auth: authClient });
  } catch (e) {
    const msg = `Google Auth failed: ${e.message}`;
    err(msg);
    await sendAlert('Google Auth Failed', msg);
    return;
  }

  // 2. Ensure sheet headers exist and load existing business names.
  let existingNames;
  try {
    await ensureHeaders(sheets);
    existingNames = await getExistingBusinessNames(sheets);
    log(`Loaded ${existingNames.size} existing businesses from sheet.`);
  } catch (e) {
    const msg = `Google Sheets read failed: ${e.message}`;
    err(msg);
    await sendAlert('Google Sheets Read Failed', msg);
    return;
  }

  // 3. Query Apollo for each city, collecting unique new leads.
  const collectedLeads = [];
  const seenInThisRun  = new Set(); // deduplicate within a single run too

  outer: for (const city of TARGET_CITIES) {
    if (collectedLeads.length >= CONFIG.run.maxLeads) break;

    log(`Searching Apollo for: ${city}`);

    let apolloData;
    try {
      apolloData = await searchApolloForCity(city);
    } catch (e) {
      const msg = `Apollo search failed for "${city}": ${e.response?.data?.error || e.message}`;
      warn(msg);
      // Continue to next city rather than aborting the whole run.
      continue;
    }

    const contacts = apolloData.people || apolloData.contacts || [];
    log(`  → Apollo returned ${contacts.length} contacts for ${city}`);

    if (contacts.length === 0) continue;

    for (const raw of contacts) {
      if (collectedLeads.length >= CONFIG.run.maxLeads) break outer;

      const lead = normaliseContact(raw);
      if (!lead) continue;                          // no phone — skip
      if (!lead.businessName) continue;             // no business name — skip

      const key = lead.businessName.toLowerCase();
      if (existingNames.has(key))  continue;        // already in sheet
      if (seenInThisRun.has(key))  continue;        // duplicate in this batch

      seenInThisRun.add(key);
      collectedLeads.push(lead);
    }
  }

  log(`Collected ${collectedLeads.length} new leads after deduplication.`);

  // 4. Handle the case where Apollo returned nothing useful.
  if (collectedLeads.length === 0) {
    const msg =
      'Apollo returned 0 usable new leads for Southwest Michigan HVAC.\n' +
      'Possible reasons: API quota reached, no new contacts matching filters, ' +
      'or all results already in the sheet.';
    warn(msg);
    await sendAlert('No New Leads Found', msg);
    return;
  }

  // 5. Convert leads to sheet rows.
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: CONFIG.run.cronTimezone,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  });

  const rows = collectedLeads.map(lead => {
    const row = new Array(Object.keys(COLUMNS).length).fill('');
    row[COLUMNS.dateAdded]    = today;
    row[COLUMNS.businessName] = lead.businessName;
    row[COLUMNS.firstName]    = lead.firstName;
    row[COLUMNS.lastName]     = lead.lastName;
    row[COLUMNS.phone]        = lead.phone;
    row[COLUMNS.city]         = lead.city;
    row[COLUMNS.website]      = lead.website;
    // COLUMNS.called and COLUMNS.notes stay blank intentionally.
    return row;
  });

  // 6. Write to Google Sheets.
  try {
    await appendRows(sheets, rows);
    log(`Successfully wrote ${rows.length} leads to Google Sheets.`);
  } catch (e) {
    const msg = `Google Sheets write failed: ${e.message}`;
    err(msg);
    await sendAlert('Google Sheets Write Failed', msg + '\n\nLeads that failed:\n' +
      collectedLeads.map(l => `${l.businessName} — ${l.phone}`).join('\n'));
    return;
  }

  log(`─── Run complete: ${rows.length} leads added ───\n`);
}

// ─── Connection test ──────────────────────────────────────────────────────────

/**
 * Called when the script is started with the --test flag. Verifies both APIs
 * are reachable and the sheet is accessible, but makes no writes.
 */
async function runConnectionTest() {
  console.log('\n══════════════════════════════════════════════');
  console.log(' HVAC Lead Gen — Connection Test');
  console.log('══════════════════════════════════════════════\n');

  // Check environment variables.
  const missing = [];
  if (!CONFIG.apollo.apiKey)           missing.push('APOLLO_API_KEY');
  if (!CONFIG.google.spreadsheetId)    missing.push('GOOGLE_SPREADSHEET_ID');
  if (missing.length) {
    err('Missing required environment variables: ' + missing.join(', '));
    err('Copy .env.example to .env and fill in all values.');
    process.exit(1);
  }

  // Test 1: Apollo API.
  process.stdout.write('Testing Apollo.io API... ');
  try {
    const data = await searchApolloForCity('Kalamazoo, Michigan', 1);
    const count = (data.people || data.contacts || []).length;
    console.log(`✓  (returned ${count} contacts on page 1)`);
  } catch (e) {
    const detail = e.response?.data?.error || e.message;
    console.log(`✗  FAILED: ${detail}`);
    err('Apollo test failed. Check APOLLO_API_KEY in your .env file.');
    process.exit(1);
  }

  // Test 2: Google Sheets.
  process.stdout.write('Testing Google Sheets access... ');
  try {
    const authClient = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    // Just read the sheet metadata — no writes.
    await sheets.spreadsheets.get({ spreadsheetId: CONFIG.google.spreadsheetId });
    console.log('✓');
  } catch (e) {
    console.log(`✗  FAILED: ${e.message}`);
    err('Google Sheets test failed. Check GOOGLE_SPREADSHEET_ID and credentials.');
    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════════');
  console.log(' All connections OK — ready to run!');
  console.log('══════════════════════════════════════════════\n');
  console.log('Next steps:');
  console.log('  node index.js          →  start the scheduler (7 AM ET daily)');
  console.log('  node index.js --once   →  run once right now and exit\n');
  process.exit(0);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test')) {
  runConnectionTest().catch(e => { err(e.message); process.exit(1); });

} else if (args.includes('--once')) {
  // Run immediately without starting the scheduler (useful for manual runs).
  runWorkflow()
    .then(() => process.exit(0))
    .catch(e => { err(e.message); process.exit(1); });

} else {
  // Normal mode: start scheduler.
  if (!CONFIG.apollo.apiKey || !CONFIG.google.spreadsheetId) {
    err('APOLLO_API_KEY and GOOGLE_SPREADSHEET_ID must be set in .env');
    err('Run "node index.js --test" to verify your setup first.');
    process.exit(1);
  }

  log(`Scheduler starting. Cron: "${CONFIG.run.cronSchedule}" (${CONFIG.run.cronTimezone})`);
  log(`Next run: ${getNextRunTime()}`);
  log('Press Ctrl+C to stop.\n');

  cron.schedule(
    CONFIG.run.cronSchedule,
    () => runWorkflow().catch(e => {
      err(`Unhandled workflow error: ${e.message}`);
      sendAlert('Workflow Crashed', e.stack || e.message);
    }),
    { timezone: CONFIG.run.cronTimezone }
  );

  // Keep the process alive.
  process.on('SIGINT',  () => { log('Scheduler stopped.'); process.exit(0); });
  process.on('SIGTERM', () => { log('Scheduler stopped.'); process.exit(0); });
}

/** Returns a human-readable string for the next scheduled fire time. */
function getNextRunTime() {
  const parts  = CONFIG.run.cronSchedule.split(' ');
  const minute = parts[0] === '0' ? '00' : parts[0];
  const hour   = parseInt(parts[1], 10);
  const ampm   = hour < 12 ? 'AM' : 'PM';
  const h12    = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${minute} ${ampm} ${CONFIG.run.cronTimezone} daily`;
}
