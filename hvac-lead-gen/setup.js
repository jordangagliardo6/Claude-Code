/**
 * hvac-lead-gen/setup.js
 *
 * First-run setup script. Run this ONCE before starting the cron job.
 * It will:
 *   1. Open a browser for Google OAuth and save token.json
 *   2. Verify the spreadsheet is accessible
 *   3. Confirm Apollo.io API key is valid
 *
 * Usage: npm run setup
 */

'use strict';

require('dotenv').config();
const { google } = require('googleapis');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');
const readline   = require('readline');

const TOKEN_PATH       = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

const SHEET_ID  = process.env.GOOGLE_SHEET_ID || '1i2wPT9RFCoNTN1_sT2gfJ6yaONTQeudLFg7CAvASFd8';
const SHEET_TAB = process.env.SHEET_TAB_NAME  || 'Sheet1';

// Only the Sheets scope is needed — no Drive write access required
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── Google OAuth flow ────────────────────────────────────────────────────────

async function authorizeGoogle() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(
      '\n❌  credentials.json not found.\n\n' +
      'Steps to create it:\n' +
      '  1. Go to https://console.cloud.google.com\n' +
      '  2. Create a project (or use an existing one)\n' +
      '  3. Enable the Google Sheets API\n' +
      '  4. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID\n' +
      '  5. Application type: Desktop app\n' +
      '  6. Download the JSON → rename it credentials.json → place it in this folder\n'
    );
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    console.log('✓  token.json already exists — skipping OAuth flow.\n');
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n─── Google OAuth ───────────────────────────────────────────────');
  console.log('Open this URL in your browser and authorize access:\n');
  console.log(authUrl);
  console.log('\nAfter authorizing, you will be redirected to localhost (it may fail to load — that\'s OK).');
  console.log('Copy the "code" value from the URL bar.\n');

  const code = await prompt('Paste the authorization code here: ');

  const { tokens } = await oAuth2Client.getToken(code.trim());
  oAuth2Client.setCredentials(tokens);

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('\n✓  token.json saved — Google OAuth complete.\n');
  return oAuth2Client;
}

// ─── Verification tests ───────────────────────────────────────────────────────

async function verifySheetAccess(auth) {
  console.log('─── Google Sheets Access ───────────────────────────────────────');
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  console.log(`✓  Spreadsheet found: "${meta.data.properties.title}"`);
  console.log(`   Tabs: ${meta.data.sheets.map(s => s.properties.title).join(', ')}\n`);

  // Confirm the sheet tab exists (or create a note)
  const tabExists = meta.data.sheets.some(s => s.properties.title === SHEET_TAB);
  if (!tabExists) {
    console.warn(`⚠️  Tab "${SHEET_TAB}" not found. The workflow will write to the first available tab.`);
    console.warn(`   To fix: rename the first tab to "${SHEET_TAB}" inside Google Sheets.\n`);
  } else {
    console.log(`✓  Tab "${SHEET_TAB}" confirmed.\n`);
  }

  // Write column headers if row 1 is empty
  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1:I1`,
  });
  const existing = (headerCheck.data.values || [[]])[0];
  if (!existing || existing.length === 0) {
    const HEADERS = [
      'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
      'Phone Number', 'City', 'Website', 'Called', 'Notes',
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId:    SHEET_ID,
      range:            `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody:      { values: [HEADERS] },
    });
    console.log('✓  Column headers written to row 1.\n');
  } else {
    console.log(`✓  Row 1 already has data: [${existing.join(', ')}]\n`);
  }
}

async function verifyApolloKey() {
  console.log('─── Apollo.io API Key ──────────────────────────────────────────');
  const key = process.env.APOLLO_API_KEY;
  if (!key || key === 'your_apollo_api_key_here') {
    console.error('❌  APOLLO_API_KEY is not set in .env\n');
    process.exit(1);
  }

  // Hit the profile endpoint — zero credits consumed
  const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
    params:  { api_key: key },
    timeout: 10_000,
  });

  if (res.data?.is_logged_in || res.status === 200) {
    console.log('✓  Apollo API key is valid.\n');
  } else {
    throw new Error('Apollo API returned an unexpected response: ' + JSON.stringify(res.data));
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n========================================');
  console.log(' HVAC Lead Gen — First-Run Setup');
  console.log('========================================\n');

  try {
    // Step 1: Google OAuth
    const auth = await authorizeGoogle();

    // Step 2: Verify sheet access + write headers
    await verifySheetAccess(auth);

    // Step 3: Verify Apollo key
    await verifyApolloKey();

    console.log('========================================');
    console.log(' ✓  All checks passed!');
    console.log('========================================\n');
    console.log('You can now start the cron job:');
    console.log('  npm start\n');
    console.log('Or run immediately (single run):');
    console.log('  node lead-gen.js --run-now\n');
    console.log(`Sheet: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit\n`);

  } catch (err) {
    console.error('\n❌  Setup failed:', err.message || err);
    process.exit(1);
  }
}

main();
