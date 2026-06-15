/**
 * setup.js — First-time setup and connection test
 *
 * Run this BEFORE starting the scheduler:
 *   npm run setup
 *
 * What it does:
 *   1. Loads your .env file and checks for required variables
 *   2. Tests your Apollo.io API key
 *   3. Walks you through Google OAuth authorization (generates token.json)
 *   4. Tests read/write access to your Google Spreadsheet
 *   5. Prints a green confirmation so you know everything is wired up
 *
 * You only need to run this once. After token.json is created, the
 * scheduler (index.js) will refresh the token automatically.
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');
const { testConnection: apolloTest } = require('./apollo');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); }
function info(msg) { console.log(`  ℹ  ${msg}`); }

// ─── Step 1: Check environment variables ─────────────────────────────────────

async function checkEnv() {
  console.log('\n── Step 1: Environment Variables ─────────────────────────────');
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  let allOk = true;
  for (const key of required) {
    if (process.env[key]) {
      pass(`${key} is set`);
    } else {
      fail(`${key} is NOT set — add it to your .env file`);
      allOk = false;
    }
  }
  if (!allOk) {
    console.error('\nFix the missing variables above, then re-run: npm run setup');
    process.exit(1);
  }
}

// ─── Step 2: Test Apollo API ──────────────────────────────────────────────────

async function checkApollo() {
  console.log('\n── Step 2: Apollo.io API ──────────────────────────────────────');
  try {
    const ok = await apolloTest();
    if (ok) {
      pass('Apollo API key is valid and returning results');
    } else {
      fail('Apollo responded but returned unexpected data — check your plan/key');
    }
  } catch (err) {
    if (err.response?.status === 401) {
      fail('Apollo returned 401 — your APOLLO_API_KEY is invalid or expired');
    } else if (err.response?.status === 429) {
      fail('Apollo returned 429 — rate limit hit, try again in a few minutes');
    } else {
      fail(`Apollo error: ${err.message}`);
    }
    console.error('\nGet your API key from: https://app.apollo.io/#/settings/integrations/api');
    process.exit(1);
  }
}

// ─── Step 3: Google OAuth setup ──────────────────────────────────────────────

async function checkGoogleAuth() {
  console.log('\n── Step 3: Google OAuth Authorization ─────────────────────────');

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    fail('credentials.json not found in the lead-generation/ folder');
    console.log('');
    console.log('  To get credentials.json:');
    console.log('  1. Go to https://console.cloud.google.com/');
    console.log('  2. Create a project (or select an existing one)');
    console.log('  3. Enable the Google Sheets API:');
    console.log('       APIs & Services → Library → search "Google Sheets API" → Enable');
    console.log('  4. Create OAuth credentials:');
    console.log('       APIs & Services → Credentials → + Create Credentials → OAuth client ID');
    console.log('       Application type: Desktop app');
    console.log('  5. Download the JSON file and save it as:');
    console.log(`       ${CREDENTIALS_PATH}`);
    console.log('  6. Re-run: npm run setup');
    process.exit(1);
  }

  pass('credentials.json found');

  if (fs.existsSync(TOKEN_PATH)) {
    pass('token.json already exists — skipping OAuth flow');
    return;
  }

  // Run the OAuth consent flow
  info('token.json not found — starting Google OAuth authorization…');
  console.log('');

  let creds;
  try {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    creds = raw.installed || raw.web;
  } catch {
    fail('credentials.json is not valid JSON — re-download it from Google Cloud Console');
    process.exit(1);
  }

  const auth = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0]
  );

  const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('  Open this URL in your browser and authorize the app:');
  console.log('');
  console.log(`  ${authUrl}`);
  console.log('');

  const code = await prompt('  Paste the authorization code here: ');
  if (!code) {
    fail('No code entered — re-run setup when ready');
    process.exit(1);
  }

  try {
    const { tokens } = await auth.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    pass('token.json created — Google authorization complete');
  } catch (err) {
    fail(`Failed to exchange code for token: ${err.message}`);
    console.error('  Make sure you copied the full code from the browser.');
    process.exit(1);
  }
}

// ─── Step 4: Test Google Sheets access ───────────────────────────────────────

async function checkSheets() {
  console.log('\n── Step 4: Google Sheets Access ───────────────────────────────');
  const { testConnection } = require('./sheets');
  try {
    const result = await testConnection();
    pass(`Spreadsheet accessible: "${result.title}"`);
    pass(`Spreadsheet ID: ${process.env.GOOGLE_SPREADSHEET_ID}`);
  } catch (err) {
    fail(`Cannot access spreadsheet: ${err.message}`);
    if (err.message.includes('not found') || err.code === 404) {
      info('Check that GOOGLE_SPREADSHEET_ID in .env matches your sheet URL');
      info('URL format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit');
    } else if (err.message.includes('permission') || err.code === 403) {
      info('Share your Google Sheet with the Google account you authorized in Step 3');
    }
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       HVAC Lead Generation — First-Time Setup             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await checkEnv();
  await checkApollo();
  await checkGoogleAuth();
  await checkSheets();

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  ✅  All connections confirmed! You are ready to go.      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Next steps:');
  console.log('  • Run the workflow once right now:   node workflow.js');
  console.log('  • Start the daily 7 AM ET scheduler: npm start');
  console.log('  • Keep it running in the background: pm2 start index.js --name lead-gen');
  console.log('');
})();
