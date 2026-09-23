/**
 * First-run setup verification script.
 * Run this BEFORE starting the scheduler to confirm both APIs are connected.
 *
 *   node setup.js
 */

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');

let passed = 0;
let failed = 0;

function ok(msg)   { console.log(`  ✓  ${msg}`); passed++; }
function fail(msg) { console.log(`  ✗  ${msg}`); failed++; }
function info(msg) { console.log(`  ℹ  ${msg}`); }

// ─── Apollo check ─────────────────────────────────────────────────────────────

async function checkApollo() {
  console.log('\n[1/2] Apollo.io API');

  const key = process.env.APOLLO_API_KEY;
  if (!key || key === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY is missing or still set to the placeholder value.');
    info('Get your key at: https://developer.apollo.io → API Keys');
    return;
  }
  ok('APOLLO_API_KEY is present');

  // Test with a minimal 1-result search to validate auth + plan
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/api_search',
      {
        api_key: key,
        person_titles: ['Owner'],
        person_locations: ['Kalamazoo, Michigan, United States'],
        q_organization_keyword_tags: ['HVAC'],
        organization_num_employees_ranges: ['1,10'],
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    if (res.data.error_code === 'API_INACCESSIBLE') {
      fail('Apollo plan does not include the people search endpoint.');
      info('Upgrade to the Basic plan ($49/mo) at https://www.apollo.io/pricing');
      info('The scheduler code is ready — it will work once the plan is upgraded.');
    } else {
      const count = res.data.people?.length ?? 0;
      ok(`Apollo people search returned ${count} result(s) — connection good`);
      if (res.data.pagination?.total_entries) {
        info(`Total matching records in Apollo: ${res.data.pagination.total_entries}`);
      }
    }
  } catch (err) {
    if (err.response?.data?.error_code === 'API_INACCESSIBLE') {
      fail('Apollo plan does not include the people search endpoint.');
      info('Upgrade to the Basic plan ($49/mo) at https://www.apollo.io/pricing');
    } else if (err.response?.status === 401) {
      fail('Apollo API key is invalid or expired.');
    } else {
      fail(`Apollo request failed: ${err.message}`);
    }
  }
}

// ─── Google Sheets check ──────────────────────────────────────────────────────

async function checkSheets() {
  console.log('\n[2/2] Google Sheets');

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId || sheetId === 'your_google_sheet_id_here') {
    fail('GOOGLE_SHEET_ID is missing or still set to the placeholder value.');
    info('Copy the ID from your spreadsheet URL: https://docs.google.com/spreadsheets/d/THE_ID/edit');
    return;
  }
  ok(`GOOGLE_SHEET_ID is present: ${sheetId}`);

  let auth;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      ok('GOOGLE_SERVICE_ACCOUNT_JSON is present and valid JSON');
    } catch {
      fail('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
      return;
    }
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    info('Using service account auth');
  } else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    ok('OAuth2 credentials are present');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    auth = oauth2;
    info('Using OAuth2 auth');
  } else {
    fail('No Google auth credentials found.');
    info('Set GOOGLE_SERVICE_ACCOUNT_JSON (recommended) or GOOGLE_CLIENT_ID + GOOGLE_REFRESH_TOKEN.');
    return;
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: 'properties.title,sheets.properties.title',
    });
    ok(`Connected to spreadsheet: "${res.data.properties.title}"`);

    const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
    const tabExists = res.data.sheets?.some((s) => s.properties.title === tab);
    if (tabExists) {
      ok(`Tab "${tab}" found`);
    } else {
      fail(`Tab "${tab}" not found. Available tabs: ${res.data.sheets?.map((s) => s.properties.title).join(', ')}`);
      info(`Set GOOGLE_SHEET_TAB in your .env to match the tab name exactly.`);
    }

    // Count existing rows
    const rows = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!B:B`,
    });
    const rowCount = Math.max(0, (rows.data.values?.length || 0) - 1); // subtract header
    info(`Current lead count in sheet: ${rowCount}`);

  } catch (err) {
    if (err.code === 403) {
      fail('Permission denied. Make sure the spreadsheet is shared with the service account email.');
    } else if (err.code === 404) {
      fail('Spreadsheet not found — check that GOOGLE_SHEET_ID is correct.');
    } else {
      fail(`Google Sheets error: ${err.message}`);
    }
  }
}

// ─── Run all checks ───────────────────────────────────────────────────────────

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Generator — Connection Setup Verification');
  console.log('═══════════════════════════════════════════════════════════');

  await checkApollo();
  await checkSheets();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\n  All checks passed. You are ready to run:');
    console.log('    node index.js --run-now   ← test one immediate run');
    console.log('    node index.js             ← start the daily 7 AM scheduler');
  } else {
    console.log('\n  Fix the issues above, then re-run:  node setup.js');
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
})();
