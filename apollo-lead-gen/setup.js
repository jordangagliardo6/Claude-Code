'use strict';

/**
 * apollo-lead-gen/setup.js
 *
 * First-time connection verifier.  Run this BEFORE starting the scheduler to
 * confirm that both Apollo.io and Google Sheets are reachable and correctly
 * configured.
 *
 * Usage:
 *   node setup.js          — verify connections only
 *   node setup.js --write  — also write (and immediately delete) a test row
 *                            to confirm the sheet is writable
 */

require('dotenv').config();

const axios      = require('axios');
const { google } = require('googleapis');

const WRITE_TEST = process.argv.includes('--write');

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Apollo HVAC Lead Gen — Setup Verification      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let allPassed = true;

  // ── 1. Required environment variables ─────────────────────────────────────
  section('Environment variables');

  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const optional = [
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'SHEET_NAME',
    'MAX_LEADS_PER_RUN',
  ];

  for (const key of required) {
    if (process.env[key]) {
      pass(`${key} is set`);
    } else {
      fail(`${key} is MISSING — add it to your .env file`);
      allPassed = false;
    }
  }

  const hasGoogleCreds =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (hasGoogleCreds) {
    pass('Google credentials found (GOOGLE_SERVICE_ACCOUNT_KEY_PATH or JSON)');
  } else {
    fail(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or ' +
      'GOOGLE_SERVICE_ACCOUNT_JSON'
    );
    allPassed = false;
  }

  for (const key of optional) {
    if (process.env[key]) {
      info(`${key} = ${key.includes('JSON') ? '[JSON present]' : process.env[key]}`);
    }
  }

  if (!allPassed) {
    console.log('\n❌  Fix the missing variables above, then re-run setup.\n');
    process.exit(1);
  }

  // ── 2. Apollo.io connection ────────────────────────────────────────────────
  section('Apollo.io API');

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        person_titles:                    ['Owner', 'President', 'Founder'],
        person_locations:                 ['Kalamazoo, Michigan, United States'],
        q_organization_keyword_tags:      ['HVAC', 'Heating and Air Conditioning', 'Plumbing'],
        organization_num_employees_ranges: ['1,25'],
        contact_phone_status:             ['likely_to_be_valid', 'verified'],
        per_page: 3,
        page:     1,
      },
      {
        headers: {
          'Content-Type':  'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key':     process.env.APOLLO_API_KEY,
        },
        timeout: 20_000,
      }
    );

    const contacts = res.data.contacts ?? res.data.people ?? [];
    const total    = res.data.pagination?.total_entries ?? 'unknown';

    pass(`Connected. Sample query returned ${contacts.length} contact(s).`);
    info(`Total matching records available: ${total}`);

    if (contacts.length > 0) {
      const sample = contacts[0];
      info(
        `Sample: ${sample.first_name ?? ''} ${sample.last_name ?? ''} — ` +
        `${sample.organization?.name ?? '(no org)'} — ` +
        `${sample.city ?? ''}`
      );
    }
  } catch (err) {
    fail(`Apollo connection failed: ${err.response?.data?.message ?? err.message}`);
    if (err.response?.status === 401) {
      info('401 = invalid API key. Check APOLLO_API_KEY in your .env file.');
    }
    allPassed = false;
  }

  // ── 3. Google Sheets connection ────────────────────────────────────────────
  section('Google Sheets API');

  let sheets;
  try {
    let auth;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else {
      auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
        scopes:  ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
    sheets = google.sheets({ version: 'v4', auth });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    });

    const sheetNames = meta.data.sheets.map((s) => s.properties.title);
    pass(`Connected. Spreadsheet: "${meta.data.properties.title}"`);
    info(`Available tabs: ${sheetNames.join(', ')}`);

    const target = process.env.SHEET_NAME || 'Sheet1';
    if (sheetNames.includes(target)) {
      pass(`Target tab "${target}" exists.`);
    } else {
      fail(
        `Tab "${target}" not found. Create it in Google Sheets or update SHEET_NAME ` +
        `to one of: ${sheetNames.join(', ')}`
      );
      allPassed = false;
    }
  } catch (err) {
    fail(`Google Sheets connection failed: ${err.message}`);
    if (err.message.includes('invalid_grant') || err.message.includes('credentials')) {
      info('Check that the service account JSON is correct and the key has not expired.');
    }
    if (err.message.includes('not found') || err.message.includes('404')) {
      info('GOOGLE_SPREADSHEET_ID may be wrong, or the service account has no access.');
      info('Share the spreadsheet with the service account email (Editor permission).');
    }
    allPassed = false;
    sheets    = null;
  }

  // ── 4. Optional write test ─────────────────────────────────────────────────
  if (WRITE_TEST && sheets) {
    section('Write / delete test');
    const target = process.env.SHEET_NAME || 'Sheet1';
    try {
      // Append a sentinel row
      await sheets.spreadsheets.values.append({
        spreadsheetId:    process.env.GOOGLE_SPREADSHEET_ID,
        range:            `${target}!A:I`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['SETUP-TEST', 'DELETE ME', '', '', '', '', '', '', '']],
        },
      });
      pass('Write succeeded — test row appended.');

      // Read back to find the row we just wrote
      const read = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range:         `${target}!A:A`,
      });
      const rows  = read.data.values ?? [];
      const rowIdx = rows.findIndex((r) => r[0] === 'SETUP-TEST');

      if (rowIdx !== -1) {
        const deleteRow = rowIdx + 1; // 1-indexed
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId:    0,
                  dimension:  'ROWS',
                  startIndex: rowIdx,
                  endIndex:   rowIdx + 1,
                },
              },
            }],
          },
        });
        pass(`Test row at row ${deleteRow} deleted successfully.`);
      }
    } catch (err) {
      fail(`Write/delete test failed: ${err.message}`);
      info('Ensure the service account has "Editor" access to the spreadsheet.');
      allPassed = false;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(52));
  if (allPassed) {
    console.log('\n✅  All checks passed! You are ready to run the scheduler.');
    console.log('\n   Start the daily 7 AM cron:   npm start');
    console.log('   Trigger an immediate run:    npm run run-now\n');
  } else {
    console.log('\n❌  One or more checks failed. Fix the issues above and re-run:\n');
    console.log('   node setup.js\n');
    process.exit(1);
  }
}

// ─── Pretty-print helpers ─────────────────────────────────────────────────────
function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 46 - title.length))}`);
}
function pass(msg)  { console.log(`  ✓  ${msg}`); }
function fail(msg)  { console.log(`  ✗  ${msg}`); }
function info(msg)  { console.log(`     ${msg}`); }

main().catch((err) => {
  console.error(`\nUnhandled error during setup: ${err.message}`);
  process.exit(1);
});
