/**
 * First-run setup verification.
 * Run this before your first scheduled run to confirm both APIs are connected.
 * Usage: node setup.js
 */
require('dotenv').config();
const axios = require('axios');
const { config, validate } = require('./src/config');
const { verifyConnection } = require('./src/sheets');

async function checkApollo() {
  console.log('\n── Apollo.io ──────────────────────────────────────');
  if (!config.apollo.apiKey) {
    console.error('  ✗  APOLLO_API_KEY is not set in .env');
    return false;
  }

  try {
    // Use the lightweight account endpoint to verify the key
    const response = await axios.get(`${config.apollo.baseUrl}/auth/health`, {
      params: { api_key: config.apollo.apiKey },
      timeout: 10000,
    });

    if (response.status === 200) {
      console.log('  ✓  Apollo API key is valid');
      console.log(`     Plan: ${response.data?.user?.account?.plan_tier || 'unknown'}`);
      return true;
    }
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;
    if (status === 401) {
      console.error('  ✗  Apollo API key is invalid or unauthorized (401)');
    } else {
      console.error(`  ✗  Apollo API check failed: ${msg}`);
    }
    // Fallback: try a minimal people search to see if the plan allows it
    try {
      console.log('     Attempting minimal people search to check plan access...');
      const testSearch = await axios.post(
        `${config.apollo.baseUrl}/mixed_people/search`,
        {
          api_key: config.apollo.apiKey,
          person_titles: ['Owner'],
          person_locations: ['Kalamazoo, Michigan'],
          per_page: 1,
        },
        { timeout: 15000 }
      );
      const count = testSearch.data?.pagination?.total_entries;
      console.log(`  ✓  People search works — ${count ?? 0} total results available for test query`);
      const firstPerson = testSearch.data?.people?.[0];
      const hasPhone = firstPerson?.phone_numbers?.length > 0;
      if (!hasPhone) {
        console.warn('  ⚠  Phone numbers are NOT included in results — your Apollo plan may require enrichment credits.');
        console.warn('     The workflow will only add leads where Apollo already has a phone number on file.');
      } else {
        console.log('  ✓  Phone numbers are included in results');
      }
      return true;
    } catch (searchErr) {
      const searchMsg = searchErr.response?.data?.message || searchErr.message;
      console.error(`  ✗  People search also failed: ${searchMsg}`);
      if (searchMsg?.toLowerCase().includes('plan')) {
        console.error('     Your Apollo plan does not include People API Search.');
        console.error('     Upgrade at: https://app.apollo.io/#/settings/plans/upgrade');
      }
      return false;
    }
  }
}

async function checkSheets() {
  console.log('\n── Google Sheets ──────────────────────────────────');
  if (!config.sheets.spreadsheetId) {
    console.error('  ✗  GOOGLE_SPREADSHEET_ID is not set in .env');
    return false;
  }

  const fs = require('fs');
  const keyPath = require('path').resolve(config.sheets.keyFile);
  if (!fs.existsSync(keyPath)) {
    console.error(`  ✗  Service account key file not found: ${keyPath}`);
    console.error('     See README.md → Step 2 to create and download a service account key.');
    return false;
  }

  try {
    const headers = await verifyConnection();
    console.log(`  ✓  Connected to spreadsheet: ${config.sheets.spreadsheetId}`);
    console.log(`  ✓  Sheet tab: "${config.sheets.sheetName}"`);
    console.log(`     Headers found: ${headers.join(', ')}`);

    const { getExistingBusinessNames } = require('./src/sheets');
    const existing = await getExistingBusinessNames();
    console.log(`  ✓  Current row count: ${existing.size} existing businesses`);
    return true;
  } catch (err) {
    console.error(`  ✗  Google Sheets connection failed: ${err.message}`);
    if (err.message.includes('permission') || err.message.includes('403')) {
      console.error('     Make sure you shared the spreadsheet with your service account email.');
      console.error('     The service account email is in the JSON key file under "client_email".');
    }
    return false;
  }
}

async function main() {
  console.log('=== HVAC Lead Gen — Connection Setup Check ===');
  console.log(`Spreadsheet ID: ${config.sheets.spreadsheetId}`);
  console.log(`Max leads per run: ${config.apollo.maxLeadsPerRun}`);
  console.log(`Cron schedule: "${config.schedule.cron}" (${config.schedule.timezone})`);

  let apolloOk = false;
  let sheetsOk = false;

  try {
    apolloOk = await checkApollo();
  } catch (err) {
    console.error(`  ✗  Unexpected Apollo error: ${err.message}`);
  }

  try {
    sheetsOk = await checkSheets();
  } catch (err) {
    console.error(`  ✗  Unexpected Sheets error: ${err.message}`);
  }

  console.log('\n── Summary ────────────────────────────────────────');
  console.log(`  Apollo.io:     ${apolloOk ? '✓ Connected' : '✗ Failed'}`);
  console.log(`  Google Sheets: ${sheetsOk ? '✓ Connected' : '✗ Failed'}`);

  if (apolloOk && sheetsOk) {
    console.log('\n  ✓  Both services connected. You can now run:');
    console.log('     node src/index.js --once     ← run now and add leads immediately');
    console.log('     node src/index.js             ← start the scheduler (runs at 7 AM Eastern daily)');
  } else {
    console.log('\n  Fix the errors above, then re-run: node setup.js');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
