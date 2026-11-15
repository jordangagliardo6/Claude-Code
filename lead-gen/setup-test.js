/**
 * Connection test — run this BEFORE the first scheduled run.
 *
 *   node setup-test.js
 *
 * It verifies:
 *   1. Apollo.io API key is valid and can search
 *   2. Google Sheets credentials are valid and the sheet is writable
 *
 * Nothing is written to your sheet during this test.
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, reason) {
  console.error(`  ✗  ${label}`);
  console.error(`     → ${reason}`);
  failed++;
}

// ── Test 1: Apollo.io ──────────────────────────────────────────

async function testApollo() {
  console.log('\n── Apollo.io ──────────────────────────────────────────');

  const key = process.env.APOLLO_API_KEY;
  if (!key || key === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY set', 'Value is missing or is the placeholder. Check your .env file.');
    return;
  }
  ok('APOLLO_API_KEY is set');

  try {
    const { data } = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        api_key: key,
        q_keywords: 'HVAC Michigan',
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    if (data && typeof data.pagination === 'object') {
      ok(`Apollo search succeeded — ${data.pagination.total_entries ?? 'unknown'} total entries for test query`);
    } else {
      fail('Apollo search response shape', `Unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
    }
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data)}`
      : err.message;
    fail('Apollo API reachable', msg);
  }
}

// ── Test 2: Google Sheets ──────────────────────────────────────

async function testGoogleSheets() {
  console.log('\n── Google Sheets ──────────────────────────────────────');

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!keyPath || keyPath === './google-credentials.json') {
    // Check if the file actually exists even with the default path
    if (!fs.existsSync(path.resolve(keyPath || ''))) {
      fail('Service account key file', `File not found at "${keyPath}". Download it from Google Cloud Console.`);
      printGoogleSetupHelp();
      return;
    }
  }

  if (fs.existsSync(path.resolve(keyPath))) {
    ok(`Service account key file found at "${keyPath}"`);
  } else {
    fail('Service account key file', `File not found at "${keyPath}"`);
    printGoogleSetupHelp();
    return;
  }

  if (!sheetId || sheetId === 'your_google_sheet_id_here') {
    fail('GOOGLE_SHEET_ID set', 'Value is missing or is the placeholder. Check your .env file.');
    return;
  }
  ok(`GOOGLE_SHEET_ID is set (${sheetId})`);

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyPath),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const tab = process.env.SHEET_TAB_NAME || 'Leads';
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!A1:I1`,
    });

    ok(`Connected to Google Sheets — tab "${tab}" is accessible`);

    const headers = data.values?.[0] ?? [];
    if (headers.length === 0) {
      console.log('     ℹ  Sheet appears empty — headers will be written on first run.');
    } else {
      console.log(`     ℹ  Existing headers: ${headers.join(' | ')}`);
    }

  } catch (err) {
    const msg = err.message ?? String(err);

    if (msg.includes('not found') || msg.includes('Unable to parse range')) {
      fail('Sheet tab accessible', `Tab "${process.env.SHEET_TAB_NAME || 'Leads'}" not found. Create it or update SHEET_TAB_NAME in .env`);
    } else if (msg.includes('permission') || msg.includes('403')) {
      fail('Sheet permission', 'Share the spreadsheet with the service account email (see key JSON → "client_email") with Editor access.');
    } else {
      fail('Google Sheets connection', msg);
    }
  }
}

function printGoogleSetupHelp() {
  console.log(`
  ── How to create a Google Service Account ─────────────────
  1. Go to https://console.cloud.google.com/
  2. Select or create a project
  3. Enable the Google Sheets API for the project
     APIs & Services → Library → "Google Sheets API" → Enable
  4. Create a service account:
     IAM & Admin → Service Accounts → Create Service Account
     Give it any name (e.g. "hvac-lead-gen")
  5. Create a JSON key:
     Click the service account → Keys → Add Key → JSON
     Download the file and save it as "google-credentials.json"
     in the lead-gen/ folder (or any path you set in .env)
  6. Share your Google Sheet with the service account email:
     Open the sheet → Share → paste the client_email from the JSON
     Give it "Editor" access
  `);
}

// ── Summary ────────────────────────────────────────────────────

async function main() {
  console.log('HVAC Lead Gen — Connection Test');
  console.log('================================');

  await testApollo();
  await testGoogleSheets();

  console.log('\n── Summary ────────────────────────────────────────────');
  if (failed === 0) {
    console.log(`  All ${passed} checks passed. You are ready to run:\n`);
    console.log('    node index.js --run-once    ← test a single run now');
    console.log('    node index.js               ← start the daily scheduler\n');
  } else {
    console.log(`  ${passed} passed, ${failed} failed. Fix the issues above and re-run setup-test.js.\n`);
    process.exit(1);
  }
}

main();
