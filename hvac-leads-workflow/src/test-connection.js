/**
 * Connection test — run this BEFORE starting the scheduler for the first time.
 * Verifies that both Apollo.io and Google Sheets are reachable and configured.
 *
 * Usage: npm run test-connection
 */

require('dotenv').config();
const { testConnection: testApollo } = require('./apollo');
const { testConnection: testSheets } = require('./sheets');
const config = require('./config');

const PASS = '✓';
const FAIL = '✗';

function line(char = '─', len = 48) {
  return char.repeat(len);
}

async function main() {
  console.log(`\n${line('═')}`);
  console.log('  HVAC Leads Workflow — Connection Test');
  console.log(line('═'));

  let allPassed = true;

  // ── 1. Check environment variables ─────────────────────────────────────────
  console.log('\n[1/3] Checking required environment variables...');

  const missing = [];
  if (!process.env.APOLLO_API_KEY) missing.push('APOLLO_API_KEY');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    missing.push('GOOGLE_APPLICATION_CREDENTIALS (or GOOGLE_SERVICE_ACCOUNT_JSON)');
  }

  if (missing.length > 0) {
    allPassed = false;
    console.error(`  ${FAIL} Missing required variables:\n    - ${missing.join('\n    - ')}`);
    console.error(`  Copy .env.example to .env and fill in the missing values.\n`);
  } else {
    console.log(`  ${PASS} All required environment variables are set.`);
  }

  // ── 2. Apollo.io ───────────────────────────────────────────────────────────
  console.log('\n[2/3] Testing Apollo.io connection...');
  try {
    const result = await testApollo();
    console.log(`  ${PASS} Connected to Apollo.io`);
    console.log(`  ${PASS} API key is valid`);
    console.log(`  ${PASS} Search query matches ~${result.totalAvailable.toLocaleString()} total people in Apollo's database`);
  } catch (err) {
    allPassed = false;
    console.error(`  ${FAIL} Apollo.io connection FAILED: ${err.response?.data?.message || err.message}`);
    if (err.response?.status === 401) {
      console.error('      → Your APOLLO_API_KEY is invalid or expired. Regenerate it at:');
      console.error('        https://app.apollo.io/#/settings/integrations/api');
    }
    console.log('');
  }

  // ── 3. Google Sheets ───────────────────────────────────────────────────────
  console.log('\n[3/3] Testing Google Sheets connection...');
  try {
    const result = await testSheets();
    console.log(`  ${PASS} Connected to Google Sheets`);
    console.log(`  ${PASS} Spreadsheet found: "${result.spreadsheetTitle}"`);
    console.log(`  ${PASS} URL: ${result.spreadsheetUrl}`);
  } catch (err) {
    allPassed = false;
    console.error(`  ${FAIL} Google Sheets connection FAILED: ${err.message}`);

    if (err.message.includes('PERMISSION_DENIED') || err.message.includes('403')) {
      console.error('      → Share the spreadsheet with your service account email.');
      console.error('        Find the email in credentials.json under "client_email".');
    } else if (err.message.includes('Could not load the default credentials')) {
      console.error('      → GOOGLE_APPLICATION_CREDENTIALS does not point to a valid file.');
      console.error('        Check the path in your .env file.');
    }
    console.log('');
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${line('═')}`);
  if (allPassed) {
    console.log(`  ${PASS} All checks passed! You're ready to go.`);
    console.log('');
    console.log('  Next steps:');
    console.log('    • Run a one-off pull now:  npm run run-now');
    console.log('    • Start the daily scheduler: npm start');
    console.log(`    • Spreadsheet ID in use: ${config.sheets.spreadsheetId}`);
  } else {
    console.log(`  ${FAIL} One or more checks failed. Fix the issues above, then re-run:`);
    console.log('    npm run test-connection');
    process.exit(1);
  }
  console.log(`${line('═')}\n`);
}

main();
