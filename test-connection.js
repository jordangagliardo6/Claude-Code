/**
 * First-Run Connection Test
 *
 * Run this BEFORE starting the scheduler to confirm that both Apollo.io and
 * Google Sheets are properly configured and reachable.
 *
 *   npm run test-connection
 *
 * What it checks:
 *   1. APOLLO_API_KEY is set and the API responds to a live search request
 *   2. GOOGLE_SERVICE_ACCOUNT_PATH points to a valid credentials file
 *   3. GOOGLE_SPREADSHEET_ID is set and the service account can read the sheet
 *   4. (Optional) SMTP credentials are present for email alerts
 */

require('dotenv').config();

const axios    = require('axios');
const fs       = require('fs');
const { ensureHeaders, getExistingBusinessNames } = require('./src/sheets');

// ── helpers ───────────────────────────────────────────────────────────────────
const PASS  = '  ✓';
const FAIL  = '  ✗';
const WARN  = '  ⚠';

function ok(msg)   { console.log(`${PASS} ${msg}`); }
function fail(msg) { console.error(`${FAIL} ${msg}`); }
function warn(msg) { console.warn(`${WARN} ${msg}`); }

// ── 1. Apollo.io ──────────────────────────────────────────────────────────────
async function testApollo() {
  console.log('\n── Apollo.io ──────────────────────────────────────────');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY is not set. Add it to your .env file.');
    return false;
  }
  ok(`API key found (${apiKey.slice(0, 8)}...)`);

  // Make a minimal live search request — just 1 result
  let response;
  try {
    response = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        api_key: apiKey,
        organization_locations: ['Kalamazoo, Michigan'],
        person_titles: ['Owner'],
        organization_num_employees_ranges: ['1,25'],
        q_organization_keyword_tags: ['hvac'],
        per_page: 1,
        page: 1,
      },
      {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        timeout: 20_000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message;
    if (status === 401 || status === 403) {
      fail(`Authentication failed (${status}). Double-check your APOLLO_API_KEY.`);
    } else {
      fail(`Apollo API request failed: ${msg}`);
    }
    return false;
  }

  const total = response.data?.pagination?.total_entries ?? 0;
  ok(`Apollo.io connected — test search returned ${total} total available results`);

  const people = response.data?.people || [];
  if (people.length > 0) {
    const sample = people[0];
    ok(`Sample contact: ${sample.first_name || '(masked)'} ${sample.last_name || '(masked)'} — ${sample.organization?.name || 'unknown company'}`);
  }

  return true;
}

// ── 2. Google Sheets ──────────────────────────────────────────────────────────
async function testSheets() {
  console.log('\n── Google Sheets ──────────────────────────────────────');

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const credPath      = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

  if (!spreadsheetId || spreadsheetId === 'your_spreadsheet_id_here') {
    fail('GOOGLE_SPREADSHEET_ID is not set. Add it to your .env file.');
    return false;
  }
  ok(`Spreadsheet ID: ${spreadsheetId}`);

  if (!credPath) {
    fail('GOOGLE_SERVICE_ACCOUNT_PATH is not set. Add it to your .env file.');
    return false;
  }
  if (!fs.existsSync(credPath)) {
    fail(`Credentials file not found at: ${credPath}`);
    fail('Download it from Google Cloud Console → Service Accounts → Keys → Add Key → JSON.');
    return false;
  }

  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  } catch {
    fail(`Could not parse ${credPath} as JSON. Re-download from Google Cloud Console.`);
    return false;
  }
  ok(`Service account: ${credentials.client_email}`);

  try {
    await ensureHeaders();
    const names = await getExistingBusinessNames();
    ok(`Spreadsheet accessible — ${names.size} existing lead(s) found`);
    ok(`Sheet tab: "${process.env.GOOGLE_SHEET_TAB || 'Leads'}"`);
  } catch (err) {
    fail(`Could not read spreadsheet: ${err.message}`);
    if (err.message?.includes('not found')) {
      fail('Make sure the spreadsheet exists and is shared with the service account email above (Editor role).');
    }
    return false;
  }

  return true;
}

// ── 3. Email alerts (optional) ────────────────────────────────────────────────
function checkMailer() {
  console.log('\n── Email Alerts (optional) ────────────────────────────');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to   = process.env.ALERT_EMAIL;

  if (!user || !pass || !to) {
    warn('SMTP credentials not set — errors will only be logged to console, not emailed.');
    warn('To enable alerts, set SMTP_USER, SMTP_PASS, and ALERT_EMAIL in your .env file.');
    return false;
  }
  ok(`Email alerts will go to: ${to} via ${user}`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('   HVAC Lead Gen — Connection Test                    ');
  console.log('══════════════════════════════════════════════════════');

  const apolloOk  = await testApollo();
  const sheetsOk  = await testSheets();
  const mailerOk  = checkMailer();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Apollo.io:      ${apolloOk  ? 'CONNECTED ✓' : 'FAILED ✗'}`);
  console.log(`  Google Sheets:  ${sheetsOk  ? 'CONNECTED ✓' : 'FAILED ✗'}`);
  console.log(`  Email Alerts:   ${mailerOk  ? 'CONFIGURED ✓' : 'NOT SET (optional)'}`);
  console.log('══════════════════════════════════════════════════════\n');

  if (apolloOk && sheetsOk) {
    console.log('All required connections verified!');
    console.log('');
    console.log('Run once right now to add your first batch of leads:');
    console.log('  RUN_NOW=true node index.js');
    console.log('');
    console.log('Or start the scheduler (runs at 7 AM ET every day):');
    console.log('  npm start');
    console.log('');
  } else {
    console.log('Fix the errors above before starting the scheduler.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnexpected error during connection test:', err.message);
  process.exit(1);
});
