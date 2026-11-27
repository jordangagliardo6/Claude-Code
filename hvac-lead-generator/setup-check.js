/**
 * First-run connection check.
 * Run BEFORE starting the scheduler to confirm both APIs are reachable.
 * Usage: node setup-check.js
 */

require('dotenv').config();
const axios = require('axios');
const { testConnection } = require('./lib/sheets');
const config = require('./config');

async function checkApollo() {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set in .env');
  }

  // Hit the account endpoint — doesn't consume search credits
  const res = await axios.get('https://api.apollo.io/v1/auth/health', {
    headers: { 'x-api-key': config.apollo.apiKey },
    timeout: 10000,
  });

  if (res.data?.is_logged_in) {
    console.log(`  Apollo.io: Connected (${res.data.email || 'authenticated'})`);
  } else {
    throw new Error(`Apollo.io auth check returned unexpected response: ${JSON.stringify(res.data)}`);
  }
}

async function checkSheets() {
  if (!config.sheets.spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env');
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set in .env');
  }

  const title = await testConnection();
  console.log(`  Google Sheets: Connected (spreadsheet: "${title}")`);
}

(async () => {
  console.log('\n=== HVAC Lead Generator — Setup Check ===\n');

  let apolloOk = false;
  let sheetsOk = false;

  console.log('Checking Apollo.io...');
  try {
    await checkApollo();
    apolloOk = true;
  } catch (err) {
    console.error(`  Apollo.io: FAILED — ${err.message}`);
  }

  console.log('Checking Google Sheets...');
  try {
    await checkSheets();
    sheetsOk = true;
  } catch (err) {
    console.error(`  Google Sheets: FAILED — ${err.message}`);
  }

  console.log('');

  if (apolloOk && sheetsOk) {
    console.log('Both connections OK. You are ready to run the scheduler:');
    console.log('  node index.js        — start the scheduler (runs daily at 7am ET)');
    console.log('  node run-now.js      — pull leads right now without waiting');
  } else {
    console.log('Fix the issues above, then re-run: node setup-check.js');
    process.exit(1);
  }

  console.log('');
})();
