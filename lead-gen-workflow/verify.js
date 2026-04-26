/**
 * verify.js — Pre-flight connection check.
 *
 * Run this BEFORE starting the scheduler to confirm both
 * Apollo.io and Google Sheets are reachable with your credentials.
 *
 * Usage: npm run verify
 */

require('dotenv').config();

const axios = require('axios');
const { verifyConnection } = require('./src/sheets');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

function ok(msg)   { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function info(msg) { console.log(`  ${YELLOW}→${RESET} ${msg}`); }

// ── Apollo.io ─────────────────────────────────────────────────────────────────
async function verifyApollo() {
  console.log(`\n${BOLD}── Apollo.io ──────────────────────────────────${RESET}`);

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY is not set in .env');
    return false;
  }
  info(`Key found: ${apiKey.slice(0, 6)}${'*'.repeat(8)}`);

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key:  apiKey,
        q_keywords: 'HVAC Michigan',
        person_titles: ['Owner'],
        per_page: 1,
      },
      {
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        timeout: 20_000,
      }
    );

    const total = res.data.pagination?.total_entries ?? 0;
    ok(`Connected. Test search found ${total} total candidate(s).`);

    if (total === 0) {
      info('Zero results on test search — filters may be too narrow, or API quota exhausted.');
    }
    return true;
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    fail(`Connection failed: ${detail}`);

    if (err.response?.status === 401) {
      info('Check that APOLLO_API_KEY is correct (Settings → API in Apollo).');
    }
    return false;
  }
}

// ── Google Sheets ─────────────────────────────────────────────────────────────
async function verifySheets() {
  console.log(`\n${BOLD}── Google Sheets ──────────────────────────────${RESET}`);

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId || spreadsheetId === 'your_spreadsheet_id_here') {
    fail('GOOGLE_SPREADSHEET_ID is not set in .env');
    return false;
  }
  info(`Spreadsheet ID: ${spreadsheetId.slice(0, 12)}...`);

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json';
  info(`Credentials file: ${credPath}`);

  try {
    const title = await verifyConnection();
    ok(`Connected. Spreadsheet name: "${title}"`);
    return true;
  } catch (err) {
    fail(`Connection failed: ${err.message}`);

    if (err.message.includes('ENOENT') || err.message.includes('no such file')) {
      info('Service account JSON file not found. Download it from Google Cloud Console.');
      info('See README → Step 2 for instructions.');
    } else if (err.message.includes('403')) {
      info('Permission denied. Share the spreadsheet with the service account email (Editor role).');
    } else if (err.message.includes('404')) {
      info('Spreadsheet not found. Double-check GOOGLE_SPREADSHEET_ID in .env.');
    }
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}═══ Lead Generation Workflow — Connection Verification ═══${RESET}`);

  const apolloOk  = await verifyApollo();
  const sheetsOk  = await verifySheets();

  console.log(`\n${BOLD}── Summary ────────────────────────────────────${RESET}`);
  console.log(`  Apollo.io:     ${apolloOk  ? `${GREEN}CONNECTED${RESET}` : `${RED}FAILED${RESET}`}`);
  console.log(`  Google Sheets: ${sheetsOk  ? `${GREEN}CONNECTED${RESET}` : `${RED}FAILED${RESET}`}`);

  if (apolloOk && sheetsOk) {
    console.log(`\n${GREEN}${BOLD}All systems connected!${RESET}`);
    console.log('  Run  npm run run-now  to execute a manual run immediately.');
    console.log('  Run  npm start        to start the 7 AM daily scheduler.\n');
  } else {
    console.log(`\n${RED}Fix the issue(s) above, then run "npm run verify" again.${RESET}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
