/**
 * First-run setup and connection verification
 *
 * Run this once before starting the scheduler:
 *   node setup.js
 *
 * What it does:
 *   1. Checks that APOLLO_API_KEY is set and makes a test request
 *   2. Walks you through the Google OAuth2 consent flow (browser-based)
 *   3. Saves the token to token.json for unattended future runs
 *   4. Verifies it can read + write the target spreadsheet
 *   5. Confirms the sheet headers match the expected column layout
 */

require('dotenv').config();

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const { URL } = require('url');
const readline = require('readline');

const { google }   = require('googleapis');
const axios        = require('axios');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8';
const SHEET_TAB      = process.env.SHEET_TAB_NAME  || 'Untitled';
const CREDENTIALS    = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const TOKEN_PATH     = process.env.GOOGLE_TOKEN_PATH       || './token.json';
const SCOPES         = ['https://www.googleapis.com/auth/spreadsheets'];

const EXPECTED_HEADERS = [
  'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
  'Phone Number', 'City', 'Website', 'Called', 'Notes',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function step(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function ok(msg)   { console.log(`  ✓  ${msg}`); }
function fail(msg) { console.error(`  ✗  ${msg}`); }
function info(msg) { console.log(`  ·  ${msg}`); }

function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ── Apollo verification ────────────────────────────────────────────────────────

async function verifyApollo() {
  step('1 / 3  Apollo.io API');

  const key = process.env.APOLLO_API_KEY;
  if (!key || key === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY is not set in .env');
    info('Get your key at: https://app.apollo.io/#/settings/integrations/api');
    process.exit(1);
  }
  ok(`API key found (${key.slice(0, 6)}…)`);

  try {
    info('Making a test search request…');
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: key,
        q_organization_locations: ['Michigan, United States'],
        q_organization_industries: ['hvac', 'heating and air conditioning'],
        organization_num_employees_ranges: ['1,25'],
        person_titles: ['Owner', 'President'],
        contact_has_phone: true,
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, timeout: 15_000 }
    );

    const count = res.data?.pagination?.total_entries ?? '?';
    ok(`Apollo connected — ${count} total results available for your search`);
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.error || err.message;
    fail(`Apollo request failed (HTTP ${status}): ${msg}`);
    if (status === 401) info('Your API key may be invalid or expired.');
    if (status === 422) info('Check your search filters in lib/apollo.js.');
    process.exit(1);
  }
}

// ── Google OAuth2 ─────────────────────────────────────────────────────────────

async function getOAuthClient() {
  if (!fs.existsSync(CREDENTIALS)) {
    fail(`credentials.json not found at: ${path.resolve(CREDENTIALS)}`);
    console.log(`
  To get your credentials.json:
    1. Go to https://console.cloud.google.com/
    2. Create (or select) a project
    3. Enable the Google Sheets API
    4. Go to APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client IDs
    5. Application type: Desktop App
    6. Download the JSON and save it as credentials.json in this folder
`);
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS, 'utf8'));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function authoriseGoogle(oAuth2Client) {
  step('2 / 3  Google Sheets OAuth2');

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    ok(`Existing token found at ${TOKEN_PATH}`);
    return;
  }

  // Build the auth URL and ask the user to visit it
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // force refresh_token to be returned
  });

  console.log('\n  Open this URL in your browser and log in with your Google account:');
  console.log(`\n  ${authUrl}\n`);

  const code = await prompt('  Paste the authorisation code here: ');

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    ok(`Token saved to ${TOKEN_PATH}`);
  } catch (err) {
    fail(`OAuth token exchange failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Sheets verification ────────────────────────────────────────────────────────

async function verifySheets(oAuth2Client) {
  step('3 / 3  Google Sheets connection');

  const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

  // Read the header row
  let headers;
  try {
    info(`Reading spreadsheet ${SPREADSHEET_ID}…`);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_TAB}'!A1:I1`,
    });
    headers = (res.data.values || [])[0] || [];
  } catch (err) {
    fail(`Could not read spreadsheet: ${err.message}`);
    info(`Make sure the spreadsheet ID in .env is correct and your Google account has access.`);
    info(`Spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
    process.exit(1);
  }

  ok('Spreadsheet is readable');

  // Validate headers
  const missing = EXPECTED_HEADERS.filter((h, i) => headers[i] !== h);
  if (missing.length > 0) {
    fail(`Header mismatch. Expected: ${EXPECTED_HEADERS.join(' | ')}`);
    fail(`Found:    ${headers.join(' | ')}`);
    info('The sheet columns must match exactly. Check SHEET_TAB_NAME in .env.');
    process.exit(1);
  }
  ok(`Headers match: ${headers.join(' | ')}`);

  // Count existing rows
  const countRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_TAB}'!B2:B`,
  });
  const rowCount = (countRes.data.values || []).length;
  ok(`Sheet currently has ${rowCount} lead rows`);

  // Test write access with a no-op (reading metadata)
  try {
    await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    ok('Write access confirmed');
  } catch {
    fail('No write access to the spreadsheet. Share it with your Google account as Editor.');
    process.exit(1);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║   HVAC Lead Generator — First-Run Setup  ║');
  console.log('╚═══════════════════════════════════════╝');

  await verifyApollo();

  const oAuth2Client = await getOAuthClient();
  await authoriseGoogle(oAuth2Client);
  await verifySheets(oAuth2Client);

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   Setup complete — all systems connected!         ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log('║                                                   ║');
  console.log('║   Run once now:    node index.js --run-now        ║');
  console.log('║   Start scheduler: node index.js                  ║');
  console.log('║   (Runs daily at 7:00 AM Eastern Time)            ║');
  console.log('║                                                   ║');
  console.log(`║   Sheet: https://docs.google.com/spreadsheets/d/  ║`);
  console.log(`║          ${SPREADSHEET_ID.slice(0, 44)} ║`);
  console.log('╚═══════════════════════════════════════════════════╝\n');
}

main().catch(err => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
