/**
 * verify.js — Pre-flight connection check
 *
 * Run this BEFORE your first scheduled run to confirm both APIs are working.
 *
 *   node verify.js
 *
 * It checks:
 *   1. Required environment variables are set
 *   2. Apollo.io API key is valid
 *   3. Google Sheets service account can access your spreadsheet
 */

require('dotenv').config();

const { testConnection: testApollo } = require('./src/apollo');
const { testConnection: testSheets } = require('./src/sheets');

const REQUIRED_VARS = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_KEY'];

function pass(msg) { console.log(`  [✓] ${msg}`); }
function fail(msg) { console.log(`  [✗] ${msg}`); }
function info(msg) { console.log(`      ${msg}`); }

async function verify() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║         HVAC Lead Gen — Connection Verification         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let allPassed = true;

  // ── 1. Environment variables ───────────────────────────────────────────────
  console.log('Step 1: Environment variables');
  const missing = REQUIRED_VARS.filter(k => !process.env[k]);

  if (missing.length > 0) {
    fail(`Missing variables: ${missing.join(', ')}`);
    info('Copy .env.example to .env and fill in your values.');
    allPassed = false;
  } else {
    pass('All required environment variables are present.');
  }

  if (process.env.NOTIFY_EMAIL && !process.env.GMAIL_APP_PASSWORD) {
    info('Optional: NOTIFY_EMAIL set but GMAIL_APP_PASSWORD is missing — email alerts disabled.');
  }

  console.log('');

  // ── 2. Apollo.io ───────────────────────────────────────────────────────────
  console.log('Step 2: Apollo.io API');

  if (!process.env.APOLLO_API_KEY) {
    fail('Skipped — APOLLO_API_KEY not set.');
    allPassed = false;
  } else {
    try {
      const result = await testApollo();
      pass(`Apollo connected. Found ${result.totalResults?.toLocaleString() ?? 'unknown'} matching records in database.`);
    } catch (err) {
      allPassed = false;
      const status = err.response?.status;
      const body   = err.response?.data;

      if (status === 401) {
        fail('Apollo: 401 Unauthorized — check your APOLLO_API_KEY.');
        info('Get a key at: https://developer.apollo.io → API Keys');
      } else if (status === 422) {
        fail(`Apollo: 422 Validation error — ${JSON.stringify(body)}`);
      } else {
        fail(`Apollo: ${err.message} (status: ${status ?? 'none'})`);
      }
    }
  }

  console.log('');

  // ── 3. Google Sheets ───────────────────────────────────────────────────────
  console.log('Step 3: Google Sheets');

  const sheetMissing = ['GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_KEY'].filter(k => !process.env[k]);
  if (sheetMissing.length > 0) {
    fail(`Skipped — missing: ${sheetMissing.join(', ')}`);
    allPassed = false;
  } else {
    try {
      const result = await testSheets();
      pass(`Google Sheets connected. Spreadsheet: "${result.properties?.title}"`);
    } catch (err) {
      allPassed = false;
      const code = err.code || err.status || err.response?.status;
      const msg  = err.message || '';

      if (String(code) === '403' || msg.toLowerCase().includes('permission')) {
        fail('Google Sheets: Permission denied (403).');
        info('You must share your spreadsheet with the service account email.');
        info('Find the email in your JSON key file under "client_email".');
        info('Share with: Editor access (not just Viewer).');
      } else if (String(code) === '404') {
        fail('Google Sheets: Spreadsheet not found (404).');
        info('Double-check GOOGLE_SHEET_ID matches the ID in your spreadsheet URL.');
        info('URL format: docs.google.com/spreadsheets/d/<SHEET_ID>/edit');
      } else if (msg.includes('DECODER') || msg.includes('PEM') || msg.includes('key')) {
        fail('Google Sheets: Invalid service account key format.');
        info('Make sure GOOGLE_SERVICE_ACCOUNT_KEY is a valid JSON file path or JSON string.');
      } else {
        fail(`Google Sheets: ${msg} (code: ${code ?? 'none'})`);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');

  if (allPassed) {
    console.log('║                    All checks passed!                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log('  Ready to run:');
    console.log('    node index.js --run-now    ← run once immediately');
    console.log('    node index.js              ← start daily 7am ET scheduler\n');
  } else {
    console.log('║              Some checks failed — see above.            ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log('  Fix the issues, then run again: node verify.js\n');
  }

  process.exit(allPassed ? 0 : 1);
}

verify().catch(err => {
  console.error('\n[Unexpected error]', err.message);
  process.exit(1);
});
