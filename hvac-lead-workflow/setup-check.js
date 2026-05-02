/**
 * setup-check.js
 *
 * Run BEFORE your first scheduled run to confirm both APIs are reachable
 * and correctly configured.
 *
 * Usage:
 *   node setup-check.js
 *
 * What it checks:
 *   1. All required environment variables are present
 *   2. Apollo.io API key is valid (makes a real search request)
 *   3. Google Sheets service account can read the target spreadsheet
 *   4. The header row is created in the sheet (safe to run multiple times)
 */

require('dotenv').config();
const axios           = require('axios');
const { verifyConnection, ensureHeader } = require('./src/sheetsClient');

const PASS = '  ✅';
const FAIL = '  ❌';
const INFO = '  ℹ️ ';

let allPassed = true;

function pass(msg)       { console.log(`${PASS}  ${msg}`); }
function fail(msg, hint) { console.error(`${FAIL}  ${msg}`); if (hint) console.error(`${INFO} ${hint}`); allPassed = false; }
function info(msg)       { console.log(`${INFO} ${msg}`); }

async function main() {
  console.log('\n──────────────────────────────────────────────────────');
  console.log('  HVAC Lead Workflow — Setup Check');
  console.log('──────────────────────────────────────────────────────\n');

  // ── 1. Environment variables ─────────────────────────────────────────────
  console.log('1. Checking environment variables…\n');

  const required = {
    APOLLO_API_KEY:                   'Apollo.io API key',
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE:  'Path to Google service-account JSON',
    GOOGLE_SPREADSHEET_ID:            'Google Spreadsheet ID',
  };

  for (const [key, label] of Object.entries(required)) {
    if (process.env[key]) {
      pass(`${key} is set`);
    } else {
      fail(`${key} is missing`, `Add  ${key}=...  to your .env file (${label})`);
    }
  }

  const optional = {
    NOTIFICATION_EMAIL: 'Email for error alerts',
    SMTP_USER:          'Gmail address for sending alerts',
    SMTP_PASS:          'Gmail App Password',
    GOOGLE_SHEET_NAME:  `Sheet tab name (defaults to "Leads")`,
    MAX_LEADS_PER_RUN:  'Max leads per daily run (defaults to 25)',
  };

  console.log('');
  info('Optional settings:');
  for (const [key, label] of Object.entries(optional)) {
    const val = process.env[key];
    if (val) {
      info(`${key} = "${val}"`);
    } else {
      info(`${key} not set — ${label}`);
    }
  }

  if (!allPassed) {
    console.log('\n  Fix the missing variables above, then re-run this check.\n');
    process.exit(1);
  }

  // ── 2. Apollo.io API ─────────────────────────────────────────────────────
  console.log('\n2. Testing Apollo.io API connection…\n');
  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { per_page: 1, page: 1 },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': process.env.APOLLO_API_KEY,
        },
        timeout: 15_000,
      }
    );
    const count = response.data?.pagination?.total_entries ?? '?';
    pass(`Apollo.io API key is valid`);
    info(`Account can reach the people-search endpoint (total entries available: ${count})`);
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      fail('Apollo.io API key is invalid or lacks permissions',
        'Check your key at https://app.apollo.io/#/settings/integrations/api');
    } else if (err.response) {
      fail(`Apollo.io returned HTTP ${err.response.status}`,
        err.response.data?.message || err.response.statusText);
    } else {
      fail(`Could not reach Apollo.io: ${err.message}`,
        'Check your internet connection.');
    }
    allPassed = false;
  }

  // ── 3. Google Sheets ─────────────────────────────────────────────────────
  console.log('\n3. Testing Google Sheets connection…\n');
  try {
    const { title, sheets } = await verifyConnection();
    pass(`Google Sheets service account authenticated`);
    pass(`Spreadsheet found: "${title}"`);
    info(`Available sheets: ${sheets.join(', ')}`);

    const targetSheet = process.env.GOOGLE_SHEET_NAME || 'Leads';
    if (sheets.includes(targetSheet)) {
      pass(`Target sheet "${targetSheet}" exists`);
    } else {
      fail(
        `Target sheet "${targetSheet}" not found`,
        `Create a tab named "${targetSheet}" in your spreadsheet, or set GOOGLE_SHEET_NAME to one of: ${sheets.join(', ')}`
      );
    }
  } catch (err) {
    if (err.message?.includes('not found')) {
      fail('Service account key file not found', err.message);
    } else if (err.message?.includes('403') || err.message?.includes('permission')) {
      fail('Permission denied on the spreadsheet',
        `Share the spreadsheet with your service account email (ends in @...iam.gserviceaccount.com) as an Editor.`);
    } else {
      fail(`Google Sheets error: ${err.message}`);
    }
    allPassed = false;
  }

  // ── 4. Header row ────────────────────────────────────────────────────────
  if (allPassed) {
    console.log('\n4. Ensuring spreadsheet header row is set up…\n');
    try {
      await ensureHeader();
      pass('Header row is ready (Date Added / Business Name / Owner First Name / …)');
    } catch (err) {
      fail(`Could not write header row: ${err.message}`);
      allPassed = false;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  if (allPassed) {
    console.log('  🎉  All checks passed! You are ready to go.\n');
    console.log('  To run the workflow immediately:');
    console.log('    node index.js --run-now\n');
    console.log('  To start the daily 7 AM scheduler:');
    console.log('    node index.js\n');
  } else {
    console.log('  ⚠️   Some checks failed. Fix the errors above and re-run:\n');
    console.log('    node setup-check.js\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\nUnexpected error during setup check:\n  ${err.message}\n`);
  process.exit(1);
});
