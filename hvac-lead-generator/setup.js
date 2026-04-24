'use strict';
// ─── FIRST-RUN SETUP VERIFICATION ────────────────────────────────────────────
// Run this BEFORE starting the scheduler to confirm both APIs are reachable.
//
//   npm run setup
//
// What it checks:
//   1. Required environment variables are present
//   2. Apollo API key is valid (makes a live test search)
//   3. Google Sheets credentials are valid and the spreadsheet is accessible
//   4. Sheet headers are initialized if the sheet is empty

require('dotenv').config();
const axios = require('axios');
const config = require('./src/config');
const logger = require('./src/logger');
const { testConnection, ensureHeaders } = require('./src/sheetsService');
const { google } = require('googleapis');
const path = require('path');

// ANSI helpers for readable terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const ok = (msg) => console.log(`  ${GREEN}✔${RESET}  ${msg}`);
const fail = (msg) => console.log(`  ${RED}✘${RESET}  ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}!${RESET}  ${msg}`);
const section = (title) => console.log(`\n${title}\n${'─'.repeat(50)}`);

// ─── STEP 1: ENV VARS ────────────────────────────────────────────────────────
function checkEnvVars() {
  section('Step 1 — Environment Variables');

  const REQUIRED = ['APOLLO_API_KEY', 'SPREADSHEET_ID'];
  const OPTIONAL = [
    'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
    'SHEET_NAME',
    'MAX_LEADS_PER_RUN',
    'NOTIFICATION_EMAIL',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
  ];

  let allPresent = true;
  for (const key of REQUIRED) {
    if (process.env[key]) {
      ok(`${key} is set`);
    } else {
      fail(`${key} is MISSING — copy .env.example to .env and fill it in`);
      allPresent = false;
    }
  }
  for (const key of OPTIONAL) {
    if (process.env[key]) {
      ok(`${key} is set (optional)`);
    } else {
      warn(`${key} not set (optional — workflow will still run without it)`);
    }
  }

  return allPresent;
}

// ─── STEP 2: APOLLO ──────────────────────────────────────────────────────────
async function checkApollo() {
  section('Step 2 — Apollo.io API Connection');

  if (!config.apolloApiKey) {
    fail('APOLLO_API_KEY not set, skipping Apollo check');
    return false;
  }

  try {
    // Use a minimal single-result search just to validate the key and endpoint.
    const res = await axios.post(
      `${config.apolloBaseUrl}/mixed_people/search`,
      {
        person_titles: ['Owner'],
        person_locations: ['Kalamazoo, Michigan, United States'],
        q_keywords: 'HVAC',
        per_page: 1,
        page: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': config.apolloApiKey,
        },
        timeout: 15_000,
      }
    );

    const count = res.data?.pagination?.total_entries ?? 0;
    ok(`Apollo API key is valid`);
    ok(`Test search returned ${count} total result(s) in the database`);

    if (count === 0) {
      warn('Zero results on the test query — this might mean Apollo has no data for');
      warn('these filters yet. Try broadening keywords in src/config.js.');
    }

    return true;
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      fail(`Apollo rejected the API key (HTTP ${status}). Check APOLLO_API_KEY in .env.`);
    } else if (status === 422) {
      fail(`Apollo returned 422 — search parameters may be malformed. Check src/config.js.`);
    } else {
      fail(`Apollo request failed: ${err.message}`);
    }
    return false;
  }
}

// ─── STEP 3: GOOGLE SHEETS ───────────────────────────────────────────────────
async function checkSheets() {
  section('Step 3 — Google Sheets Connection');

  const keyFile = path.isAbsolute(config.googleServiceAccountKeyFile)
    ? config.googleServiceAccountKeyFile
    : path.join(__dirname, config.googleServiceAccountKeyFile);

  const fs = require('fs');
  if (!fs.existsSync(keyFile)) {
    fail(`Service account key file not found: ${keyFile}`);
    fail('Download it from Google Cloud Console → IAM → Service Accounts → Keys → JSON');
    return false;
  }
  ok(`credentials.json found at ${keyFile}`);

  if (!config.spreadsheetId) {
    fail('SPREADSHEET_ID not set in .env');
    return false;
  }

  try {
    const { spreadsheetId, title } = await testConnection();
    ok(`Connected to Google Sheets`);
    ok(`Spreadsheet: "${title}" (${spreadsheetId})`);
  } catch (err) {
    if (err.message?.includes('PERMISSION_DENIED') || err.code === 403) {
      fail(`Access denied to spreadsheet. Share it with the service account email from credentials.json.`);
    } else if (err.code === 404) {
      fail(`Spreadsheet not found. Double-check SPREADSHEET_ID in .env.`);
    } else {
      fail(`Sheets connection failed: ${err.message}`);
    }
    return false;
  }

  // Write headers if not present — idempotent, safe to run multiple times.
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
    await ensureHeaders(sheets);
    ok(`Sheet headers verified / initialized`);
    ok(`Columns: ${config.sheetColumns.join(' | ')}`);
  } catch (err) {
    fail(`Could not write headers: ${err.message}`);
    return false;
  }

  return true;
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   HVAC Lead Generator — First-Run Setup Check   ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const envOk = checkEnvVars();
  const apolloOk = await checkApollo();
  const sheetsOk = await checkSheets();

  section('Result');
  const allGood = envOk && apolloOk && sheetsOk;

  if (allGood) {
    ok('All checks passed!');
    console.log(`\n  ${GREEN}You're ready to go.${RESET} Start the scheduler with:\n`);
    console.log('    npm start\n');
    console.log('  Or trigger a single manual run right now:\n');
    console.log('    npm run run-now\n');
  } else {
    fail('One or more checks failed. Fix the issues above, then run: npm run setup\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected setup error:', err.message);
  process.exit(1);
});
