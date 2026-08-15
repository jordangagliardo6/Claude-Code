/**
 * First-Run Connection Test
 *
 * Verifies Apollo.io and Google Sheets are both reachable and configured
 * correctly before the daily scheduler runs for the first time.
 *
 * Usage:
 *   npm run setup
 *   node setup.js
 */

'use strict';

require('dotenv').config();
const axios  = require('axios');
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus';
const REQUIRED_HEADERS = [
  'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
  'Phone Number', 'City', 'Website', 'Called', 'Notes',
];

let passed = 0;
let failed = 0;

function ok(label)  { console.log(`  ✓  ${label}`); passed++; }
function fail(label, detail) {
  console.error(`  ✗  ${label}`);
  if (detail) console.error(`       ${detail}`);
  failed++;
}

// ─── Check 1: Environment variables ──────────────────────────────────────────

async function checkEnv() {
  console.log('\n── Environment Variables ──────────────────────────────');
  const required = [
    'APOLLO_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
  ];
  for (const key of required) {
    if (process.env[key]) ok(key);
    else fail(key, 'Missing — add it to your .env file');
  }
  if (process.env.SPREADSHEET_ID) {
    ok(`SPREADSHEET_ID = ${process.env.SPREADSHEET_ID}`);
  } else {
    ok(`SPREADSHEET_ID defaulting to built-in value (${SPREADSHEET_ID})`);
  }
}

// ─── Check 2: Apollo.io connectivity ─────────────────────────────────────────

async function checkApollo() {
  console.log('\n── Apollo.io ──────────────────────────────────────────');
  try {
    const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'x-api-key': process.env.APOLLO_API_KEY },
    });
    if (res.status === 200) {
      ok('API key is valid and Apollo is reachable');
    } else {
      fail('Unexpected status from Apollo health check', `HTTP ${res.status}`);
    }
  } catch (err) {
    if (err.response?.status === 401) {
      fail('API key rejected', 'Check APOLLO_API_KEY in your .env');
    } else if (err.response?.status === 403) {
      fail(
        'API access denied — likely a plan limitation',
        'The /mixed_people/search endpoint requires Apollo Basic or higher.\n' +
        '       Upgrade at https://www.apollo.io/pricing'
      );
    } else {
      fail('Could not reach Apollo API', err.message);
    }
    return;
  }

  // Dry-run search (1 credit if results are returned)
  console.log('  Running a dry-run Apollo search (may cost 1 credit)...');
  try {
    const res = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        person_titles:                     ['owner'],
        organization_num_employees_ranges: ['1,25'],
        organization_sic_codes:            ['1711'],
        person_locations:                  ['Kalamazoo, Michigan'],
        per_page: 5,
        page: 1,
      },
      {
        headers: {
          'x-api-key':    process.env.APOLLO_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    const count = res.data?.people?.length ?? 0;
    ok(`Prospecting search works — ${count} sample result(s) returned`);
    if (count > 0) {
      const sample = res.data.people[0];
      ok(`  Sample: "${sample.first_name} ${sample.last_name}" at "${sample.organization?.name || 'N/A'}"`);
    }
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    if (err.response?.status === 403 || detail?.includes?.('Free plan')) {
      fail(
        'Prospecting endpoint not available on current plan',
        'Upgrade to Apollo Basic at https://www.apollo.io/pricing\n' +
        '       The scheduler will still start, but search calls will fail until you upgrade.'
      );
    } else {
      fail('Apollo search dry-run failed', detail);
    }
  }
}

// ─── Check 3: Google Sheets connectivity ─────────────────────────────────────

async function checkSheets() {
  console.log('\n── Google Sheets ──────────────────────────────────────');

  let auth;
  try {
    auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    ok('OAuth2 client initialized');
  } catch (err) {
    fail('Failed to initialize OAuth2 client', err.message);
    return;
  }

  const sheets = google.sheets({ version: 'v4', auth });

  // Verify spreadsheet is accessible
  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    ok(`Spreadsheet found: "${meta.data.properties.title}"`);
    ok(`  URL: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  } catch (err) {
    if (err.code === 404) {
      fail('Spreadsheet not found', `Check SPREADSHEET_ID (${SPREADSHEET_ID})`);
    } else if (err.code === 403) {
      fail('Access denied to spreadsheet', 'Make sure the authenticated Google account can edit it.');
    } else {
      fail('Could not open spreadsheet', err.message);
    }
    return;
  }

  // Verify headers
  try {
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:I1',
    });
    const headers = (headerRes.data.values?.[0] || []).map(h => h.trim());
    const match = REQUIRED_HEADERS.every((h, i) => headers[i] === h);
    if (match) {
      ok('Column headers match expected layout');
    } else {
      fail(
        'Column headers do not match expected layout',
        `Expected: ${REQUIRED_HEADERS.join(' | ')}\n` +
        `  Found:    ${headers.join(' | ')}`
      );
    }
  } catch (err) {
    fail('Failed to read sheet headers', err.message);
  }

  // Count existing rows
  try {
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!B:B',
    });
    const rows = (dataRes.data.values || []).slice(1); // skip header
    ok(`Sheet currently has ${rows.length} lead(s) (excluding header row)`);
  } catch (err) {
    fail('Failed to count existing rows', err.message);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== HVAC Lead Workflow — Connection Test ===');

  await checkEnv();
  await checkApollo();
  await checkSheets();

  console.log('\n── Summary ────────────────────────────────────────────');
  console.log(`  Passed: ${passed}   Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n  ✓ All checks passed. You are ready to run the workflow.');
    console.log('  Start the scheduler:  npm start');
    console.log('  Run once right now:   npm run run-now\n');
  } else {
    console.log('\n  Fix the issues above, then run `npm run setup` again.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnexpected error during setup:', err.message);
  process.exit(1);
});
