'use strict';

/**
 * verify.js — Run this BEFORE the first scheduled execution to confirm that
 * both Apollo.io and Google Sheets are reachable and correctly configured.
 *
 *   node verify.js
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const PASS = '✓';
const FAIL = '✗';

let allPassed = true;

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Apollo HVAC Lead Gen — Connection Verification');
  console.log('══════════════════════════════════════════════════\n');

  await checkEnvVars();
  await checkApollo();
  await checkGoogleSheets();

  console.log('\n══════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  All checks passed — ready to run the scheduler!');
    console.log('  Start it with:  node index.js');
    console.log('  Or run once:    node index.js --run-now');
  } else {
    console.log('  One or more checks FAILED. Fix the issues above,');
    console.log('  then run  node verify.js  again before starting.');
  }
  console.log('══════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

// ── 1. Required environment variables ─────────────────────────────────────────
async function checkEnvVars() {
  section('Environment Variables');

  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH'];

  for (const key of required) {
    if (process.env[key]) {
      ok(`${key} is set`);
    } else {
      fail(`${key} is NOT set — add it to your .env file`);
    }
  }

  // Check the credentials file actually exists
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (keyPath) {
    const resolved = path.resolve(keyPath);
    if (fs.existsSync(resolved)) {
      ok(`Service account key file found at ${resolved}`);
    } else {
      fail(`Service account key file NOT found at ${resolved}`);
    }
  }
}

// ── 2. Apollo.io API ──────────────────────────────────────────────────────────
async function checkApollo() {
  section('Apollo.io API');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.log(`  ${FAIL} Skipped (APOLLO_API_KEY not set)\n`);
    return;
  }

  try {
    // Hit a lightweight endpoint — the user profile — to validate the key
    const res = await axios.get('https://api.apollo.io/v1/auth/health', {
      params: { api_key: apiKey },
      timeout: 15_000,
    });

    if (res.status === 200) {
      ok('API key is valid — Apollo connection successful');
      const plan = res.data?.user?.organization_name ?? 'unknown plan';
      console.log(`  ℹ  Account: ${plan}`);
    } else {
      fail(`Unexpected status ${res.status} from Apollo health endpoint`);
    }
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      fail('Apollo API key is invalid or lacks permissions');
    } else if (err.response?.status === 404) {
      // Health endpoint may not exist on all plans — try the search endpoint with per_page=1
      await checkApolloViaSearch(apiKey);
    } else {
      fail(`Apollo request failed: ${err.message}`);
    }
  }
}

async function checkApolloViaSearch(apiKey) {
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: apiKey,
        page: 1,
        per_page: 1,
        person_titles: ['Owner'],
        organization_locations: ['Michigan, United States'],
      },
      { timeout: 20_000 },
    );

    if (res.status === 200) {
      const total = res.data?.pagination?.total_entries ?? '?';
      ok(`Apollo search API reachable — sample query returned ${total} total results`);
    } else {
      fail(`Apollo search returned status ${res.status}`);
    }
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      fail('Apollo API key is invalid or the People Search API is not enabled on your plan');
    } else {
      fail(`Apollo search check failed: ${err.message}`);
    }
  }
}

// ── 3. Google Sheets ──────────────────────────────────────────────────────────
async function checkGoogleSheets() {
  section('Google Sheets API');

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!keyPath || !spreadsheetId) {
    console.log(`  ${FAIL} Skipped (missing GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SPREADSHEET_ID)\n`);
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyPath),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = google.sheets({ version: 'v4', auth });

    // Try to read spreadsheet metadata
    const meta = await client.spreadsheets.get({ spreadsheetId });
    ok(`Connected to spreadsheet: "${meta.data.properties.title}"`);

    // Check if the "Leads" tab exists
    const sheets = meta.data.sheets ?? [];
    const leadsTab = sheets.find((s) => s.properties.title === 'Leads');
    if (leadsTab) {
      ok('Found "Leads" tab in the spreadsheet');
    } else {
      const tabs = sheets.map((s) => `"${s.properties.title}"`).join(', ');
      warn(`No "Leads" tab found. Existing tabs: ${tabs}`);
      console.log('  ℹ  The workflow will write to a tab named "Leads". Create it, or');
      console.log('     update SHEET_TAB in src/config.js to match an existing tab name.');
    }

    // Confirm the service account has write access
    await client.spreadsheets.values.get({
      spreadsheetId,
      range: 'Leads!A1',
    });
    ok('Read access confirmed — service account has the correct permissions');
  } catch (err) {
    if (err.code === 404 || err.status === 404) {
      fail(
        `Spreadsheet not found (ID: ${spreadsheetId}). ` +
          'Check GOOGLE_SPREADSHEET_ID in your .env file.',
      );
    } else if (err.code === 403 || err.status === 403) {
      fail(
        'Permission denied. Share the spreadsheet with the service account email ' +
          '(Editor access) and try again.',
      );
    } else {
      fail(`Google Sheets check failed: ${err.message}`);
    }
  }
}

// ── Output helpers ─────────────────────────────────────────────────────────────

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 44 - title.length))}`);
}

function ok(msg) {
  console.log(`  ${PASS} ${msg}`);
}

function warn(msg) {
  console.log(`  ⚠  ${msg}`);
}

function fail(msg) {
  console.log(`  ${FAIL} ${msg}`);
  allPassed = false;
}

main().catch((err) => {
  console.error('\nUnexpected error during verification:', err.message);
  process.exit(1);
});
