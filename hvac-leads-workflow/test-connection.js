/**
 * First-run connection test.
 * Run BEFORE the first scheduled run to confirm both APIs are working.
 *
 *   node test-connection.js
 *
 * All checks must pass before you start the scheduler.
 */

require('dotenv').config();
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const fs = require('fs');

const APOLLO_API_KEY   = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID   = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_TAB        = process.env.GOOGLE_SHEET_TAB_NAME || 'Sheet1';
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';

let passed = 0;
let failed = 0;

function ok(label)  { console.log(`  ✅ ${label}`); passed++; }
function fail(label, hint) {
  console.error(`  ❌ ${label}`);
  if (hint) console.error(`     → ${hint}`);
  failed++;
}

async function checkEnvVars() {
  console.log('\n─── Environment Variables ───────────────────────────────');
  APOLLO_API_KEY ? ok('APOLLO_API_KEY is set') : fail('APOLLO_API_KEY missing', 'Add it to your .env file');
  SPREADSHEET_ID ? ok('GOOGLE_SPREADSHEET_ID is set') : fail('GOOGLE_SPREADSHEET_ID missing', 'Add the Sheet ID from its URL to your .env');
  CREDENTIALS_PATH ? ok(`GOOGLE_CREDENTIALS_PATH = ${CREDENTIALS_PATH}`) : fail('GOOGLE_CREDENTIALS_PATH missing');
  fs.existsSync(CREDENTIALS_PATH)
    ? ok(`credentials.json found at ${CREDENTIALS_PATH}`)
    : fail(`credentials.json NOT found at ${CREDENTIALS_PATH}`, 'Download your service account key from Google Cloud Console');
}

async function checkApollo() {
  console.log('\n─── Apollo.io API ───────────────────────────────────────');
  if (!APOLLO_API_KEY) { fail('Skipped (no API key)'); return; }

  try {
    // Low-cost endpoint: just check auth works
    const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'x-api-key': APOLLO_API_KEY },
      timeout: 10000,
    });
    ok(`Apollo API connected (status ${res.status})`);
  } catch (err) {
    if (err.response?.status === 401) {
      fail('Apollo API key is invalid or expired', 'Check your key at https://developer.apollo.io/keys/');
    } else if (err.response?.status === 404) {
      // Auth health endpoint may not exist on all plans — try a minimal search instead
      try {
        await axios.post('https://api.apollo.io/api/v1/mixed_people/api_search',
          { person_titles: ['Owner'], per_page: 1 },
          { headers: { 'Content-Type': 'application/json', 'x-api-key': APOLLO_API_KEY }, timeout: 10000 }
        );
        ok('Apollo API connected (people search accessible)');
      } catch (err2) {
        const msg = err2.response?.data?.error || err2.message;
        if (msg && msg.includes('ENDPOINT_ACCESS_DENIED')) {
          fail('Apollo people search requires a PAID plan', 'Upgrade at https://www.apollo.io/pricing');
        } else if (err2.response?.status === 401) {
          fail('Apollo API key is invalid or expired', 'Check your key at https://developer.apollo.io/keys/');
        } else {
          fail(`Apollo API error: ${msg}`);
        }
      }
    } else {
      fail(`Apollo API unreachable: ${err.message}`);
    }
  }
}

async function checkGoogleSheets() {
  console.log('\n─── Google Sheets ───────────────────────────────────────');
  if (!fs.existsSync(CREDENTIALS_PATH)) { fail('Skipped (credentials.json not found)'); return; }
  if (!SPREADSHEET_ID) { fail('Skipped (no GOOGLE_SPREADSHEET_ID)'); return; }

  let serviceEmail = '(unknown)';
  try {
    const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    serviceEmail = creds.client_email || serviceEmail;
    ok(`Service account: ${serviceEmail}`);
  } catch {
    fail('Could not read credentials.json', 'Ensure it is valid JSON downloaded from Google Cloud Console');
    return;
  }

  try {
    const auth = new GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Read spreadsheet metadata
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    ok(`Spreadsheet found: "${meta.data.properties.title}"`);

    // Count existing rows
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_TAB}!A:A`,
    });
    const rowCount = Math.max(0, (data.data.values || []).length - 1); // subtract header
    ok(`Sheet tab "${SHEET_TAB}" readable — ${rowCount} data rows currently`);

  } catch (err) {
    if (err.code === 403) {
      fail('Permission denied — sheet not shared with service account',
        `Share the spreadsheet with: ${serviceEmail}  (Editor access)`);
    } else if (err.code === 404) {
      fail('Spreadsheet not found', 'Double-check GOOGLE_SPREADSHEET_ID in your .env');
    } else {
      fail(`Sheets API error: ${err.message}`);
    }
  }
}

async function main() {
  console.log('=== HVAC Lead Workflow — Connection Test ===');
  console.log(`Running at ${new Date().toISOString()}\n`);

  await checkEnvVars();
  await checkApollo();
  await checkGoogleSheets();

  console.log('\n─────────────────────────────────────────────────────────');
  if (failed === 0) {
    console.log(`✅  All ${passed} checks passed — you're ready to run the workflow!`);
    console.log('\nNext steps:');
    console.log('  Run once now:    node index.js');
    console.log('  Start scheduler: node scheduler.js');
    console.log('  Keep it running: pm2 start scheduler.js --name hvac-leads');
  } else {
    console.log(`❌  ${failed} check(s) failed, ${passed} passed.`);
    console.log('    Fix the issues above, then re-run: node test-connection.js');
  }
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Unexpected error during test:', err.message);
  process.exit(1);
});
