'use strict';

/**
 * setup.js — First-run connection tester
 *
 * Usage:
 *   node setup.js              → test Apollo + Google Sheets connections
 *   node setup.js --init-sheet → also write the header row to your sheet
 */

require('dotenv').config();

const axios      = require('axios');
const { google } = require('googleapis');
const config     = require('./config');

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';

// ─── Apollo Test ─────────────────────────────────────────────────────────────

async function testApollo() {
  console.log('\nTesting Apollo.io connection...');

  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is missing from .env');
  }

  const res = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      api_key:                           process.env.APOLLO_API_KEY,
      page:                              1,
      per_page:                          5,
      person_titles:                     ['owner'],
      organization_num_employees_ranges: ['1,25'],
      organization_locations:            config.apolloLocations,
      organization_sic_codes:            config.apolloSicCodes,
      q_organization_keyword_tags:       config.industryKeywords,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
  );

  const total  = res.data.pagination?.total_entries ?? 0;
  const sample = res.data.people?.slice(0, 3) ?? [];

  console.log(`${PASS} Apollo connected.`);
  console.log(`     ~${total} total records match your HVAC + Michigan filters.`);

  if (sample.length > 0) {
    console.log('     Sample results:');
    sample.forEach(p => {
      const hasPhone = (p.phone_numbers?.length || 0) > 0;
      console.log(`       • ${p.first_name || '?'} ${p.last_name || '?'} @ ${p.organization_name || '?'} — ${p.city || 'city unknown'} — phone: ${hasPhone ? 'yes' : 'no'}`);
    });
  }
}

// ─── Google Sheets Test ───────────────────────────────────────────────────────

async function buildAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    return new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
      scopes:  ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes:      ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  throw new Error(
    'No Google credentials set.\n' +
    '  Add GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_CREDENTIALS_JSON to .env'
  );
}

async function testGoogleSheets(initSheet = false) {
  console.log('\nTesting Google Sheets connection...');

  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    throw new Error('GOOGLE_SPREADSHEET_ID is missing from .env');
  }

  const auth   = await buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const id     = process.env.GOOGLE_SPREADSHEET_ID;

  // Fetch spreadsheet metadata
  const meta  = await sheets.spreadsheets.get({ spreadsheetId: id });
  const title = meta.data.properties.title;
  const tabs  = meta.data.sheets.map(s => s.properties.title);

  console.log(`${PASS} Google Sheets connected.`);
  console.log(`     Spreadsheet: "${title}"`);
  console.log(`     Tabs: ${tabs.join(', ')}`);

  if (!tabs.includes(config.sheetTabName)) {
    console.log(`${WARN} Tab "${config.sheetTabName}" not found. Update config.sheetTabName to match one of: ${tabs.join(', ')}`);
    return;
  }

  // Check for header row
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range:         `${config.sheetTabName}!1:1`,
  });

  const existingHeaders = headerRes.data.values?.[0] || [];

  if (existingHeaders.length === 0) {
    if (initSheet) {
      console.log('     No headers found — writing header row...');
      await sheets.spreadsheets.values.update({
        spreadsheetId:    id,
        range:            `${config.sheetTabName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody:      { values: [config.sheetColumns] },
      });
      console.log(`${PASS} Header row written: ${config.sheetColumns.join(' | ')}`);
    } else {
      console.log(`${WARN} Row 1 is empty. Run "npm run init-sheet" to write the header row, or add it manually.`);
      console.log(`     Expected: ${config.sheetColumns.join(' | ')}`);
    }
  } else {
    console.log(`     Row 1 headers: ${existingHeaders.join(' | ')}`);

    const expected = config.sheetColumns.map(c => c.toLowerCase().trim());
    const actual   = existingHeaders.map(c => c.toLowerCase().trim());
    const mismatch = expected.filter((h, i) => actual[i] !== h);

    if (mismatch.length) {
      console.log(`${WARN} Header mismatch — expected: ${config.sheetColumns.join(' | ')}`);
      console.log('     Leads may land in wrong columns. Fix headers or update config.sheetColumns.');
    } else {
      console.log(`${PASS} Headers match config — data will land in the right columns.`);
    }
  }

  // Count existing rows
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range:         `${config.sheetTabName}!B:B`,
  });
  const rowCount = Math.max(0, (dataRes.data.values?.length || 1) - 1); // exclude header
  console.log(`     Current lead count: ${rowCount} row(s).`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const initSheet = process.argv.includes('--init-sheet');

  console.log('══════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('══════════════════════════════════════════════');

  let apolloOk = false;
  let sheetsOk = false;

  try {
    await testApollo();
    apolloOk = true;
  } catch (err) {
    console.error(`${FAIL} Apollo.io FAILED: ${err.message}`);
    if (err.response?.status === 401) {
      console.error('     Your APOLLO_API_KEY is invalid or expired.');
    }
  }

  try {
    await testGoogleSheets(initSheet);
    sheetsOk = true;
  } catch (err) {
    console.error(`${FAIL} Google Sheets FAILED: ${err.message}`);
    if (err.message.includes('PERMISSION_DENIED') || err.message.includes('403')) {
      console.error('     The service account was not shared with this spreadsheet.');
      console.error('     Share the sheet with your service account email (Editor access).');
    }
  }

  console.log('\n══════════════════════════════════════════════');

  if (apolloOk && sheetsOk) {
    console.log(`${PASS} All systems connected — you're ready to run!\n`);
    console.log('Next steps:');
    console.log('  1. Test a one-off run:   npm run run-now');
    console.log('     (Check your sheet — 25 leads should appear)');
    console.log('  2. Start the scheduler:  npm start');
    console.log('     (Runs at 7 AM Eastern every day; keep the process alive with PM2)');
    console.log('  3. Keep it running:      pm2 start index.js --name hvac-lead-gen');
    console.log('                           pm2 save && pm2 startup');
  } else {
    console.log(`${FAIL} Fix the error(s) above, then run "node setup.js" again.\n`);
    process.exit(1);
  }

  console.log('══════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error(`\n${FAIL} Setup crashed: ${err.message}\n`);
  process.exit(1);
});
