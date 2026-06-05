/**
 * setup.js — Run this ONCE before your first scheduled workflow run.
 *
 * What it does:
 *   1. Walks you through Google OAuth 2.0 authorization → saves credentials/token.json
 *   2. Confirms your Apollo.io API key works
 *   3. Opens your Google Sheet, verifies the connection, and writes column headers
 *      if row 1 is still empty
 *
 * Run:  node setup.js
 */

require('dotenv').config();

const { google } = require('googleapis');
const readline   = require('readline');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'google-oauth.json');
const TOKEN_PATH       = path.join(__dirname, 'credentials', 'token.json');
const SCOPES           = ['https://www.googleapis.com/auth/spreadsheets'];

const EXPECTED_HEADERS = [
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

// ── Step 1: Google OAuth ──────────────────────────────────────────────────────

async function authorizeGoogle() {
  // Ensure credentials directory exists
  const credDir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(credDir)) fs.mkdirSync(credDir, { recursive: true });

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('\n  ✗ credentials/google-oauth.json not found.\n');
    console.error('  How to get it:');
    console.error('  1. Go to https://console.cloud.google.com');
    console.error('  2. Create a project (or select an existing one)');
    console.error('  3. APIs & Services → Enable APIs → enable "Google Sheets API"');
    console.error('  4. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID');
    console.error('  5. Application type: Desktop App → Download JSON');
    console.error(`  6. Save the file as: ${CREDENTIALS_PATH}\n`);
    process.exit(1);
  }

  const creds   = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed ?? creds.web;
  const oauth2  = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Already authorized — reuse saved token
  if (fs.existsSync(TOKEN_PATH)) {
    oauth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    console.log('  ✓ Google already authorized (credentials/token.json found)');
    return oauth2;
  }

  // Interactive OAuth flow
  const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\n  ── Google Authorization Required ──────────────────────────────');
  console.log('  Open this URL in your browser:\n');
  console.log('  ' + authUrl);
  console.log('');
  console.log('  After you click "Allow", Google gives you a short code.');

  const rl   = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve =>
    rl.question('  Paste that code here and press Enter: ', resolve)
  );
  rl.close();

  const { tokens } = await oauth2.getToken(code.trim());
  oauth2.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('  ✓ Authorized! credentials/token.json saved.\n');
  return oauth2;
}

// ── Step 2: Apollo Connection Test ───────────────────────────────────────────

async function testApollo() {
  const key = process.env.APOLLO_API_KEY;

  if (!key || key === 'your_apollo_api_key_here') {
    console.error('  ✗ APOLLO_API_KEY not set (or still a placeholder) in .env');
    return false;
  }

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        person_titles:    ['Owner'],
        person_locations: ['Kalamazoo, Michigan'],
        per_page:         1,
        page:             1,
      },
      {
        headers:  { 'x-api-key': key, 'Content-Type': 'application/json' },
        timeout:  15_000,
      }
    );

    const total = res.data?.pagination?.total_entries ?? 0;
    const plan  = res.data?.metadata?.plan_type ?? 'unknown';
    console.log(`  ✓ Apollo connected — ${total} owners found in Kalamazoo, MI (plan: ${plan})`);

    if (total > 0) {
      const sample = res.data.people?.[0];
      const hasPhone = (sample?.phone_numbers ?? []).length > 0;
      if (!hasPhone) {
        console.log('  ⚠  Sample contact has no phone number exposed.');
        console.log('     Apollo phone numbers require a Basic plan ($49/mo) or higher.');
        console.log('     On the free tier, search works but phones will be empty.');
        console.log('     Upgrade at: https://app.apollo.io/#/settings/plans/upgrade\n');
      }
    }
    return true;

  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error ?? err.message;
    console.error(`  ✗ Apollo error (HTTP ${status ?? 'network'}): ${detail}`);
    if (status === 401) console.error('     → Invalid API key. Get one at https://developer.apollo.io');
    return false;
  }
}

// ── Step 3: Google Sheets Connection Test ────────────────────────────────────

async function testSheets(auth) {
  const sheetId = process.env.SPREADSHEET_ID;
  const tab     = process.env.SHEET_TAB || 'Sheet1';

  if (!sheetId || sheetId === 'YOUR_SPREADSHEET_ID_HERE') {
    console.error('  ✗ SPREADSHEET_ID not set (or still a placeholder) in .env');
    return false;
  }

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // Confirm the sheet is accessible
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    console.log(`  ✓ Spreadsheet found: "${meta.data.properties.title}"`);

    // Check for the tab
    const tabNames = meta.data.sheets?.map(s => s.properties.title) ?? [];
    if (!tabNames.includes(tab)) {
      console.error(`  ✗ Tab "${tab}" not found. Available tabs: ${tabNames.join(', ')}`);
      console.error(`    Update SHEET_TAB in .env to match one of those names.`);
      return false;
    }

    // Check / write headers
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range:         `${tab}!A1:I1`,
    });

    const headers = (headerRes.data.values ?? [[]])[0] ?? [];

    if (headers.length === 0) {
      // Empty sheet — write headers
      await sheets.spreadsheets.values.update({
        spreadsheetId:    sheetId,
        range:            `${tab}!A1:I1`,
        valueInputOption: 'RAW',
        requestBody:      { values: [EXPECTED_HEADERS] },
      });
      console.log(`  ✓ Column headers written to row 1 of "${tab}"`);
    } else {
      console.log(`  ✓ Headers found: ${headers.join(' | ')}`);
      // Warn if they don't match
      const match = EXPECTED_HEADERS.every((h, i) => h === headers[i]);
      if (!match) {
        console.log('  ⚠  Headers differ from the expected layout.');
        console.log('     Expected: ' + EXPECTED_HEADERS.join(' | '));
        console.log('     Found:    ' + headers.join(' | '));
        console.log('     The workflow will still run, but column positions may be wrong.');
      }
    }

    return true;

  } catch (err) {
    const detail = err.response?.data?.error?.message ?? err.message;
    console.error(`  ✗ Google Sheets error: ${detail}`);
    if (detail.includes('not found') || detail.includes('PERMISSION')) {
      console.error('     → Make sure the sheet is shared with your Google account.');
    }
    return false;
  }
}

// ── Entry Point ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — First-Run Setup & Connection Test');
  console.log('══════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(path.join(__dirname, '.env'))) {
    console.error('  ✗ .env file not found.');
    console.error('    Copy .env.example → .env and fill in your values, then re-run.\n');
    process.exit(1);
  }

  let allGood = true;

  // ── Step 1: Apollo
  console.log('Step 1 — Apollo.io');
  const apolloOk = await testApollo();
  if (!apolloOk) allGood = false;

  // ── Step 2 + 3: Google
  console.log('\nStep 2 — Google OAuth');
  let auth;
  try {
    auth = await authorizeGoogle();
  } catch (err) {
    console.error(`  ✗ Google auth failed: ${err.message}`);
    allGood = false;
  }

  if (auth) {
    console.log('\nStep 3 — Google Sheets');
    const sheetsOk = await testSheets(auth);
    if (!sheetsOk) allGood = false;
  }

  // ── Summary
  console.log('\n══════════════════════════════════════════════════════════');
  if (allGood) {
    console.log('  ✓ ALL SYSTEMS GO — you are ready to run the workflow.');
    console.log('');
    console.log('  Start the daily scheduler:');
    console.log('    node index.js');
    console.log('');
    console.log('  Run immediately (test without waiting for 7 AM):');
    console.log('    npm run test-run');
    console.log('');
    console.log('  Keep it running in the background (optional):');
    console.log('    pm2 start index.js --name hvac-lead-gen');
  } else {
    console.log('  ✗ Fix the errors listed above, then run this script again.');
  }
  console.log('══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error(`\n  Fatal: ${err.message}\n`);
  process.exit(1);
});
