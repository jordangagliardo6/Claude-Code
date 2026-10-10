/**
 * Setup verification — run this BEFORE your first scheduled run.
 *
 *   node setup-check.js
 *
 * Checks:
 *   1. Apollo.io API key is valid and can reach the search endpoint
 *   2. Google Sheets service account credentials are valid
 *   3. The target spreadsheet is accessible and the header row looks correct
 */

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');

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

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ✗  ${label}`);
  if (detail) console.error(`     → ${detail}`);
  failed++;
}

// ── Check 1: Environment variables ───────────────────────────────────────────
console.log('\n── Step 1: Environment variables ──');

if (process.env.APOLLO_API_KEY) {
  ok('APOLLO_API_KEY is set');
} else {
  fail('APOLLO_API_KEY is missing', 'Add it to your .env file');
}

if (process.env.GOOGLE_SPREADSHEET_ID) {
  ok('GOOGLE_SPREADSHEET_ID is set');
} else {
  fail('GOOGLE_SPREADSHEET_ID is missing', 'Add it to your .env file');
}

const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'credentials.json';
const fs = require('fs');
const keyFilePath = require('path').resolve(__dirname, keyFile);

if (fs.existsSync(keyFilePath)) {
  ok(`Service account key file found: ${keyFile}`);
} else {
  fail(`Service account key file not found: ${keyFile}`,
    'Download it from Google Cloud Console → IAM & Admin → Service Accounts');
}

// ── Check 2: Apollo.io connection ─────────────────────────────────────────────
console.log('\n── Step 2: Apollo.io API ──');

async function checkApollo() {
  try {
    const response = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        person_titles: ['Owner'],
        organization_locations: ['Kalamazoo, Michigan'],
        organization_num_employees_ranges: ['1,25'],
        page: 1,
        per_page: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY,
        },
        timeout: 15_000,
      }
    );

    const people = response.data.people || [];
    ok(`Apollo API reachable — search returned ${people.length} result(s)`);

    if (response.data.pagination) {
      const total = response.data.pagination.total_entries;
      console.log(`     Total available results for test query: ${total}`);
    }
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    fail('Apollo API request failed', detail);
  }
}

// ── Check 3: Google Sheets connection ────────────────────────────────────────
console.log('\n── Step 3: Google Sheets ──');

async function checkSheets() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const sheetName = process.env.SHEET_NAME || 'Sheet1';

    // Read first row to check headers
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `${sheetName}!A1:I1`,
    });

    ok('Google Sheets API connection successful');

    const headers = (res.data.values?.[0] || []).map(h => h.trim());

    if (headers.length === 0) {
      fail('Header row is empty',
        `Add these headers to row 1: ${EXPECTED_HEADERS.join(', ')}`);
      return;
    }

    const mismatches = EXPECTED_HEADERS.filter((expected, i) => {
      const actual = headers[i] || '';
      return actual.toLowerCase() !== expected.toLowerCase();
    });

    if (mismatches.length === 0) {
      ok('Header row matches expected columns');
    } else {
      fail('Header row mismatch',
        `Expected: ${EXPECTED_HEADERS.join(' | ')}\n     Found:    ${headers.join(' | ')}`);
    }

    // Count existing rows
    const countRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `${sheetName}!B2:B`,
    });
    const rowCount = (countRes.data.values || []).length;
    console.log(`     Sheet tab "${sheetName}" has ${rowCount} existing lead rows`);

  } catch (err) {
    if (err.message.includes('invalid_grant') || err.message.includes('credentials')) {
      fail('Google authentication failed', 'Check that credentials.json is valid');
    } else if (err.code === 403) {
      fail('Access denied to spreadsheet',
        'Share the Google Sheet with your service account email (found in credentials.json as "client_email")');
    } else {
      fail('Google Sheets check failed', err.message);
    }
  }
}

// ── Run all async checks, then summarize ─────────────────────────────────────
(async () => {
  if (process.env.APOLLO_API_KEY) await checkApollo();
  if (process.env.GOOGLE_SPREADSHEET_ID && fs.existsSync(keyFilePath)) await checkSheets();

  console.log('\n── Summary ──');
  console.log(`  Passed: ${passed}  Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n  All checks passed — you are ready to run the workflow!\n');
    console.log('  Run once now:  node index.js');
    console.log('  Start daily scheduler:  node scheduler.js\n');
  } else {
    console.log('\n  Fix the issues above and re-run: node setup-check.js\n');
    process.exit(1);
  }
})();
