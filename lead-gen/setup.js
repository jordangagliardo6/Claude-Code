'use strict';

/**
 * First-run setup verification.
 * Run: node setup.js
 *
 * Checks:
 *  1. .env file is loaded with required keys
 *  2. Apollo.io API key is valid (live API call)
 *  3. Google Sheets connection works (read + create header if needed)
 */

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ✓  ${msg}`);
  passed++;
}

function fail(msg, hint) {
  console.error(`  ✗  ${msg}`);
  if (hint) console.error(`     → ${hint}`);
  failed++;
}

async function checkEnv() {
  console.log('\n── 1. Environment variables ──────────────────────────────────');
  const required = {
    APOLLO_API_KEY: 'Get from https://app.apollo.io/#/settings/integrations/api',
    GOOGLE_SHEET_ID: 'Copy from your Google Sheets URL: .../spreadsheets/d/<ID>/edit',
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH: 'Path to your service account JSON file',
  };

  for (const [key, hint] of Object.entries(required)) {
    if (process.env[key]) {
      pass(`${key} is set`);
    } else {
      fail(`${key} is missing`, hint);
    }
  }

  if (process.env.NOTIFY_EMAIL) {
    pass(`NOTIFY_EMAIL is set (${process.env.NOTIFY_EMAIL})`);
    if (!process.env.GMAIL_APP_PASSWORD) {
      fail('GMAIL_APP_PASSWORD not set — email notifications will not work',
        'Google Account → Security → App Passwords');
    }
  } else {
    console.log('  –  NOTIFY_EMAIL not set — error notifications will only appear in console logs');
  }
}

async function checkApollo() {
  console.log('\n── 2. Apollo.io API ──────────────────────────────────────────');
  if (!process.env.APOLLO_API_KEY) {
    fail('Skipping Apollo check — API key not set');
    return;
  }

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/auth/health',
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY,
        },
        timeout: 15000,
      }
    );
    if (res.status === 200) {
      pass('Apollo API key is valid');
    } else {
      fail(`Apollo returned HTTP ${res.status}`, 'Double-check your API key');
    }
  } catch (err) {
    if (err.response?.status === 401) {
      fail('Apollo API key is invalid or expired',
        'Get a fresh key at https://app.apollo.io/#/settings/integrations/api');
    } else {
      // Health endpoint may not exist on all plans — try a lightweight search
      try {
        const searchRes = await axios.post(
          'https://api.apollo.io/v1/mixed_people/search',
          { api_key: process.env.APOLLO_API_KEY, per_page: 1, page: 1 },
          { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        if (searchRes.data && searchRes.data.people !== undefined) {
          pass('Apollo API key is valid (search endpoint reachable)');
        } else {
          fail('Apollo returned unexpected response', JSON.stringify(searchRes.data).slice(0, 200));
        }
      } catch (searchErr) {
        fail(`Apollo API error: ${searchErr.response?.data?.message || searchErr.message}`,
          'Check your API key and account status');
      }
    }
  }
}

async function checkGoogleSheets() {
  console.log('\n── 3. Google Sheets ──────────────────────────────────────────');
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!keyPath) {
    fail('Skipping Sheets check — GOOGLE_SERVICE_ACCOUNT_KEY_PATH not set');
    return;
  }

  const absKeyPath = path.resolve(keyPath);
  if (!fs.existsSync(absKeyPath)) {
    fail(`Service account key file not found: ${absKeyPath}`,
      '1. Go to Google Cloud Console → IAM & Admin → Service Accounts\n' +
      '     2. Create a service account (or use existing)\n' +
      '     3. Keys tab → Add Key → JSON → download\n' +
      '     4. Save to ' + absKeyPath + '\n' +
      '     5. Share your spreadsheet with the service account email (Editor access)');
    return;
  }

  let serviceAccountEmail = '(unknown)';
  try {
    const keyData = JSON.parse(fs.readFileSync(absKeyPath, 'utf8'));
    serviceAccountEmail = keyData.client_email || '(unknown)';
    pass(`Service account key file found: ${absKeyPath}`);
    pass(`Service account email: ${serviceAccountEmail}`);
  } catch (parseErr) {
    fail(`Could not parse service account key file: ${parseErr.message}`,
      'Make sure you downloaded the JSON key (not P12)');
    return;
  }

  if (!sheetId) {
    fail('Skipping Sheets connection test — GOOGLE_SHEET_ID not set');
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: absKeyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    pass(`Connected to spreadsheet: "${meta.data.properties.title}"`);

    const sheetNames = meta.data.sheets.map((s) => s.properties.title);
    if (sheetNames.includes('Leads')) {
      pass(`"Leads" tab already exists`);
    } else {
      console.log('  –  "Leads" tab not found — it will be created on the first run');
    }
  } catch (err) {
    if (err.code === 403 || err.message?.includes('403')) {
      fail('Google Sheets: Permission denied',
        `Share your spreadsheet with ${serviceAccountEmail} (Editor access)\n` +
        '     then run setup.js again');
    } else if (err.code === 404 || err.message?.includes('404')) {
      fail('Google Sheets: Spreadsheet not found',
        'Double-check GOOGLE_SHEET_ID in .env — it\'s the long ID in the URL');
    } else {
      fail(`Google Sheets error: ${err.message}`);
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          HVAC Lead Gen — First-Run Setup Verification        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await checkEnv();
  await checkApollo();
  await checkGoogleSheets();

  console.log('\n──────────────────────────────────────────────────────────────');
  if (failed === 0) {
    console.log(`\n  All ${passed} checks passed! You're ready to go.\n`);
    console.log('  Run a test pull now:   npm run run-once');
    console.log('  Start the scheduler:   npm start\n');
  } else {
    console.log(`\n  ${passed} passed, ${failed} failed — fix the issues above, then run:\n`);
    console.log('  node setup.js\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nSetup script crashed:', err.message);
  process.exit(1);
});
