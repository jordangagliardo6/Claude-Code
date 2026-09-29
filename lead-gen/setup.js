/**
 * setup.js
 *
 * ONE-TIME SETUP — run this once before the first scheduled run.
 *
 * Usage:
 *   npm run setup
 *
 * What it does:
 *   1. Reads credentials.json (your Google OAuth2 Desktop client credentials).
 *   2. Opens a browser for you to log in and grant Sheets access.
 *   3. Saves token.json — all future runs use this silently (no browser needed).
 *   4. Verifies the Apollo API key by hitting the profile endpoint.
 *   5. Reads the first row of your spreadsheet to confirm Sheets access works.
 */

require('dotenv').config();
const { google } = require('googleapis');
const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs';
const SHEET_NAME = process.env.SHEET_NAME || 'Untitled';

async function main() {
  console.log('\n=== HVAC Lead Gen — First-Time Setup ===\n');

  // ── Step 1: Google OAuth ─────────────────────────────────────────────────
  console.log('Step 1: Authorizing Google Sheets access...\n');

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('ERROR: credentials.json not found in lead-gen/');
    console.error('\nTo get it:');
    console.error('  1. Go to https://console.cloud.google.com');
    console.error('  2. Create or select a project');
    console.error('  3. Enable "Google Sheets API" (APIs & Services → Library)');
    console.error('  4. Go to APIs & Services → Credentials');
    console.error('  5. Create OAuth 2.0 Client ID → Desktop app');
    console.error('  6. Download the JSON and save it as lead-gen/credentials.json');
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Open this URL in your browser and log in with your Google account:\n');
  console.log(authUrl);
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) => {
    rl.question('Paste the authorization code here: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log('\n✓ token.json saved — Google Sheets authorization complete.\n');

  // ── Step 2: Verify spreadsheet access ───────────────────────────────────
  console.log('Step 2: Verifying spreadsheet access...');
  const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:I1`,
    });
    const headers = resp.data.values?.[0] ?? [];
    console.log(`✓ Connected to spreadsheet. Header row: [${headers.join(', ')}]\n`);
  } catch (err) {
    console.error('ERROR: Could not read spreadsheet:', err.message);
    console.error('  - Make sure SPREADSHEET_ID in .env is correct.');
    console.error('  - Make sure the sheet tab name matches SHEET_NAME in .env.');
    process.exit(1);
  }

  // ── Step 3: Verify Apollo API key ────────────────────────────────────────
  console.log('Step 3: Verifying Apollo API key...');

  if (!process.env.APOLLO_API_KEY) {
    console.error('ERROR: APOLLO_API_KEY is not set in .env');
    console.error('  Get your API key at: https://app.apollo.io/#/settings/integrations/api');
    process.exit(1);
  }

  try {
    const resp = await axios.get('https://api.apollo.io/api/v1/users/api_profile', {
      headers: { 'X-Api-Key': process.env.APOLLO_API_KEY },
    });
    const user = resp.data?.user;
    console.log(`✓ Apollo connected — logged in as ${user?.name ?? user?.email ?? 'unknown'}`);
    console.log(`  Remaining lead credits: ${user?.num_credits_remaining ?? 'N/A'}`);
    console.log(`  Remaining direct-dial credits: ${user?.effective_num_direct_dial_credits ?? 'N/A'}\n`);
  } catch (err) {
    const msg = err.response?.data?.message ?? err.message;
    console.error('ERROR: Apollo API key check failed:', msg);
    process.exit(1);
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log('=== Setup complete! ===');
  console.log('');
  console.log('To run a lead pull RIGHT NOW:      npm run run-now');
  console.log('To start the daily 7am scheduler:  npm start');
  console.log('');
  console.log('IMPORTANT — Apollo plan note:');
  console.log('  The People API Search requires an Apollo Professional plan or above.');
  console.log('  Upgrade at: https://app.apollo.io/#/settings/plans/upgrade');
  console.log('  Once upgraded, `npm run run-now` will pull up to 25 new leads immediately.');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
