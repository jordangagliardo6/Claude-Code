/**
 * First-run verification script.
 * Run: node setup.js
 * Confirms Apollo.io and Google Sheets are both reachable before you start the scheduler.
 */
require('dotenv').config();

const axios  = require('axios');
const path   = require('path');
const { google } = require('googleapis');

// ──────────────────────────────────────────
// Apollo.io verification
// ──────────────────────────────────────────
async function verifyApollo() {
  console.log('\n── Apollo.io ────────────────────────────────');
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    console.error('  ❌  APOLLO_API_KEY is missing or still set to the placeholder.');
    console.error('      Copy .env.example → .env and fill in your key.');
    return false;
  }

  try {
    // Minimal search — 1 result — to prove the key is valid and filters work
    const { data } = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        api_key: apiKey,
        person_titles: ['owner'],
        person_locations: ['Michigan, United States'],
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
    );

    const total = data?.pagination?.total_entries ?? '?';
    console.log(`  ✅  Connected — Apollo sees ${total} records matching "owner + Michigan"`);
    return true;
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.error(`  ❌  Apollo request failed: ${detail}`);
    if (err.response?.status === 401) {
      console.error('      Your API key appears to be invalid. Check apollo.io → Settings → API.');
    }
    return false;
  }
}

// ──────────────────────────────────────────
// Google Sheets verification
// ──────────────────────────────────────────
async function verifySheets() {
  console.log('\n── Google Sheets ────────────────────────────');
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const credPath      = process.env.GOOGLE_CREDENTIALS_PATH || path.join(process.cwd(), 'credentials.json');

  if (!spreadsheetId || spreadsheetId === 'your_spreadsheet_id_here') {
    console.error('  ❌  GOOGLE_SPREADSHEET_ID is missing or still set to the placeholder.');
    return false;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const res    = await sheets.spreadsheets.get({ spreadsheetId });
    const title  = res.data.properties?.title ?? 'Unknown';

    console.log(`  ✅  Connected — spreadsheet: "${title}"`);
    console.log(`      ID: ${spreadsheetId}`);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`  ❌  Credentials file not found at: ${credPath}`);
      console.error('      See the SETUP GUIDE below for how to create it.');
    } else if (err.message.includes('403') || err.message.includes('permission')) {
      console.error('  ❌  Permission denied. Did you share the sheet with your service account email?');
    } else if (err.message.includes('404')) {
      console.error('  ❌  Spreadsheet not found. Double-check GOOGLE_SPREADSHEET_ID in .env');
    } else {
      console.error(`  ❌  Google Sheets error: ${err.message}`);
    }
    return false;
  }
}

// ──────────────────────────────────────────
// Main
// ──────────────────────────────────────────
async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  HVAC Lead Gen — First-Run Verification    ║');
  console.log('╚════════════════════════════════════════════╝');

  const apolloOk = await verifyApollo();
  const sheetsOk = await verifySheets();

  console.log('\n── Summary ──────────────────────────────────');
  console.log(`  Apollo.io:     ${apolloOk ? '✅ Connected' : '❌ Failed'}`);
  console.log(`  Google Sheets: ${sheetsOk ? '✅ Connected' : '❌ Failed'}`);

  if (apolloOk && sheetsOk) {
    console.log('\n  🟢  All systems connected!');
    console.log('\n  Next steps:');
    console.log('    node index.js              — start scheduler (7 AM Eastern, daily)');
    console.log('    node index.js --run-now    — run immediately AND start scheduler');
    console.log('    Logs are written to:       logs/workflow.log\n');
    process.exit(0);
  } else {
    console.log('\n  🔴  Fix the issues above, then re-run: node setup.js\n');
    printSetupGuide(apolloOk, sheetsOk);
    process.exit(1);
  }
}

function printSetupGuide(apolloOk, sheetsOk) {
  if (!apolloOk) {
    console.log('── Apollo Setup ─────────────────────────────');
    console.log('  1. Log in at https://app.apollo.io');
    console.log('  2. Go to Settings → Integrations → API');
    console.log('  3. Copy your API key and paste it into .env as APOLLO_API_KEY\n');
  }

  if (!sheetsOk) {
    console.log('── Google Sheets Setup ──────────────────────');
    console.log('  1. Go to https://console.cloud.google.com');
    console.log('  2. Create (or select) a project');
    console.log('  3. Enable "Google Sheets API" in APIs & Services');
    console.log('  4. Go to IAM → Service Accounts → Create a service account');
    console.log('  5. Give it the "Editor" role (or a custom Sheets role)');
    console.log('  6. Click the service account → Keys → Add Key → JSON');
    console.log('  7. Save the downloaded file as credentials.json in this folder');
    console.log('  8. Open your Google Sheet → Share → paste the service account email');
    console.log('     (found in credentials.json as "client_email") → give Editor access');
    console.log('  9. Copy the Sheet ID from the URL into .env as GOOGLE_SPREADSHEET_ID\n');
  }
}

main().catch(err => {
  console.error('\nSetup crashed unexpectedly:', err.message);
  process.exit(1);
});
