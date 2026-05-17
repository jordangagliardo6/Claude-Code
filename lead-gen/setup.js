/**
 * First-run setup and connection verification
 *
 * Run this BEFORE starting the scheduler to confirm both APIs are wired up.
 * Usage: node setup.js
 */

require('dotenv').config();
const axios = require('axios');
const { verifyConnection, getAuthClient } = require('./src/sheetsWriter');
const log = require('./src/logger');

const CHECK  = '✓';
const CROSS  = '✗';
const WARN   = '⚠';

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Setup & Connection Verification');
  console.log('══════════════════════════════════════════════════════════\n');

  let allOk = true;

  // ── 1. Check .env variables ───────────────────────────────────────────────
  console.log('[ 1 / 3 ]  Checking environment variables...\n');

  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_CREDENTIALS_PATH'];
  const optional = ['ALERT_EMAIL_TO', 'SMTP_USER', 'SMTP_PASS', 'CRON_SCHEDULE', 'MAX_LEADS_PER_RUN'];

  for (const key of required) {
    if (process.env[key]) {
      console.log(`  ${CHECK}  ${key} is set`);
    } else {
      console.log(`  ${CROSS}  ${key} is MISSING  ← required`);
      allOk = false;
    }
  }

  for (const key of optional) {
    if (process.env[key]) {
      console.log(`  ${CHECK}  ${key} is set (optional)`);
    } else {
      console.log(`  ${WARN}  ${key} not set (optional — using default)`);
    }
  }

  if (!allOk) {
    console.log('\n  Copy .env.example to .env and fill in the required values, then re-run setup.\n');
    process.exit(1);
  }

  // ── 2. Test Apollo.io API ─────────────────────────────────────────────────
  console.log('\n[ 2 / 3 ]  Testing Apollo.io connection...\n');

  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        person_locations: ['Kalamazoo, Michigan'],
        person_titles: ['Owner'],
        organization_num_employees_ranges: ['1,25'],
        q_organization_keyword_tags: ['HVAC'],
        contact_phone_status: 'verified',
        page: 1,
        per_page: 1,
      },
      {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        timeout: 20000,
      }
    );

    const count = response.data?.pagination?.total_entries || response.data?.people?.length || 0;
    console.log(`  ${CHECK}  Apollo API connected successfully`);
    console.log(`  ${CHECK}  Test query returned ${count} total matching records in Apollo's database`);

    if (count === 0) {
      console.log(`  ${WARN}  Zero results for the test query. Your Apollo plan may not include`);
      console.log(`        this data or the test filter is very narrow. Full search still runs.`);
    }
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    console.log(`  ${CROSS}  Apollo connection FAILED: HTTP ${status || 'N/A'} — ${detail}`);
    if (status === 401 || status === 403) {
      console.log(`        → Check your APOLLO_API_KEY value.`);
    }
    allOk = false;
  }

  // ── 3. Test Google Sheets API ─────────────────────────────────────────────
  console.log('\n[ 3 / 3 ]  Testing Google Sheets connection...\n');
  console.log('  (If this is your first run, a browser authorization URL will appear below.)\n');

  try {
    const meta = await verifyConnection();
    console.log(`  ${CHECK}  Google Sheets API connected successfully`);
    console.log(`  ${CHECK}  Spreadsheet: "${meta.title}"`);
    console.log(`  ${CHECK}  Available sheets: ${meta.sheets.join(', ')}`);

    if (!meta.sheets.includes('Sheet1')) {
      console.log(`  ${WARN}  No tab named "Sheet1" found. Either rename one of your tabs to`);
      console.log(`        "Sheet1" or update the range strings in src/sheetsWriter.js.`);
    }
  } catch (err) {
    console.log(`  ${CROSS}  Google Sheets connection FAILED: ${err.message}`);
    if (err.message.includes('credentials file not found')) {
      console.log(`        → Download your OAuth 2.0 credentials JSON from Google Cloud Console`);
      console.log(`          and save it to the path in GOOGLE_CREDENTIALS_PATH.`);
    }
    allOk = false;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  if (allOk) {
    console.log('  ALL CHECKS PASSED — you are ready to run the workflow!\n');
    console.log('  Run once immediately:   node src/workflow.js');
    console.log('  Start daily scheduler:  node src/scheduler.js');
    console.log('  (Keep the scheduler alive with: pm2 start src/scheduler.js)');
  } else {
    console.log('  SETUP INCOMPLETE — fix the issues above and run setup again.');
    process.exitCode = 1;
  }
  console.log('══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\nUnhandled setup error:', err.message);
  process.exitCode = 1;
});
