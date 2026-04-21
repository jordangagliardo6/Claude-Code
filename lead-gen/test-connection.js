'use strict';

// Run this before the first scheduled execution to confirm both APIs are
// reachable and credentials are valid.
// Usage: node test-connection.js

require('dotenv').config();
const logger = require('./src/logger');
const { testConnection: apolloTest } = require('./src/apollo');
const { testConnection: sheetsTest } = require('./src/sheets');

const PASS = '✓ PASS';
const FAIL = '✗ FAIL';

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('═══════════════════════════════════════════════\n');

  let allPassed = true;

  // ── 1. Environment variables ──────────────────────────────────────────────
  console.log('[ Checking environment variables ]');
  const required = [
    'APOLLO_API_KEY',
    'SPREADSHEET_ID',
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  ];
  for (const key of required) {
    if (process.env[key]) {
      console.log(`  ${PASS}  ${key} is set`);
    } else {
      console.log(`  ${FAIL}  ${key} is MISSING — add it to your .env file`);
      allPassed = false;
    }
  }

  const optional = ['ALERT_EMAIL', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'];
  const emailConfigured = optional.every((k) => process.env[k]);
  if (emailConfigured) {
    console.log(`  ${PASS}  Email alert variables are set`);
  } else {
    console.log(`  (info) Email alerts not configured — errors will log to console only`);
  }

  console.log();

  // ── 2. Apollo.io API ──────────────────────────────────────────────────────
  console.log('[ Testing Apollo.io API ]');
  try {
    const { leads, totalEntries } = await apolloTest();
    console.log(`  ${PASS}  Apollo API reachable`);
    console.log(`         Total matching records in Apollo: ~${totalEntries}`);
    console.log(`         Sample lead (phone-valid): ${leads.length > 0 ? leads[0].businessName || '(name hidden by plan)' : '(none on page 1)'}`);
  } catch (err) {
    console.log(`  ${FAIL}  Apollo API failed: ${err.message}`);
    console.log('         Check your APOLLO_API_KEY and ensure the account is active.');
    allPassed = false;
  }

  console.log();

  // ── 3. Google Sheets API ──────────────────────────────────────────────────
  console.log('[ Testing Google Sheets API ]');
  try {
    const title = await sheetsTest();
    console.log(`  ${PASS}  Google Sheets API reachable`);
    console.log(`         Connected to spreadsheet: "${title}"`);
  } catch (err) {
    console.log(`  ${FAIL}  Google Sheets failed: ${err.message}`);
    if (err.message.includes('not found')) {
      console.log('         Is SPREADSHEET_ID correct? Copy it from the URL: /spreadsheets/d/{ID}/edit');
    } else if (err.message.includes('permission')) {
      console.log('         Share the spreadsheet with your service account email (Editor access).');
    } else if (err.message.includes('key')) {
      console.log('         Check GOOGLE_SERVICE_ACCOUNT_KEY_PATH points to a valid JSON key file.');
    }
    allPassed = false;
  }

  console.log();
  console.log('═══════════════════════════════════════════════');
  if (allPassed) {
    console.log('  ALL CHECKS PASSED — safe to start the scheduler');
    console.log('  Run:  npm start');
  } else {
    console.log('  ONE OR MORE CHECKS FAILED — fix the issues above before starting');
  }
  console.log('═══════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  logger.error('Unexpected error during connection test', err);
  process.exit(1);
});
