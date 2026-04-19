/**
 * Run this BEFORE starting the scheduler to confirm both APIs work.
 * Usage: npm run test-connection
 */
require('dotenv').config();
const axios = require('axios');
const { verifyConnection } = require('./src/sheets');
const { log } = require('./src/logger');

async function testApollo() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in your .env file.');
  }

  log.info('[Apollo] Testing API key...');
  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      q_organization_keyword_tags: ['hvac'],
      person_titles: ['Owner'],
      person_locations: ['Kalamazoo, Michigan, United States'],
      organization_num_employees_ranges: ['1,25'],
      per_page: 1,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': process.env.APOLLO_API_KEY,
      },
    }
  );

  const total = response.data?.pagination?.total_entries ?? '?';
  log.info(`[Apollo] Connected! Found ${total} total matching records for test query.`);
  return true;
}

async function testSheets() {
  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set in your .env file.');
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set in your .env file.');
  }

  log.info('[Google Sheets] Testing connection...');
  const info = await verifyConnection();
  log.info(`[Google Sheets] Connected! Spreadsheet: "${info.title}"`);
  log.info(`[Google Sheets] Available sheets: ${info.sheetNames.join(', ')}`);

  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  if (!info.sheetNames.includes(sheetName)) {
    log.warn(`[Google Sheets] WARNING: Sheet tab "${sheetName}" not found. Available: ${info.sheetNames.join(', ')}`);
    log.warn(`[Google Sheets] Update GOOGLE_SHEET_NAME in your .env to match one of the above.`);
  } else {
    log.info(`[Google Sheets] Target sheet "${sheetName}" exists. Ready to write.`);
  }

  return true;
}

async function main() {
  console.log('\n========================================');
  console.log('  Lead Gen Workflow — Connection Test');
  console.log('========================================\n');

  let apolloOk = false;
  let sheetsOk = false;

  try {
    apolloOk = await testApollo();
  } catch (err) {
    log.error(`[Apollo] FAILED: ${err.response?.data?.message || err.message}`);
    if (err.response?.status === 401) {
      log.error('[Apollo] 401 Unauthorized — check your APOLLO_API_KEY value.');
    }
  }

  try {
    sheetsOk = await testSheets();
  } catch (err) {
    log.error(`[Google Sheets] FAILED: ${err.message}`);
    if (err.message.includes('invalid_grant') || err.message.includes('credentials')) {
      log.error('[Google Sheets] Credential error — make sure the JSON key file path is correct and the service account has edit access to the sheet.');
    }
  }

  console.log('\n========================================');
  console.log(`  Apollo.io:     ${apolloOk ? '✓ Connected' : '✗ Failed'}`);
  console.log(`  Google Sheets: ${sheetsOk ? '✓ Connected' : '✗ Failed'}`);
  console.log('========================================\n');

  if (apolloOk && sheetsOk) {
    console.log('Both APIs are working. You can now run:');
    console.log('  npm run run-now   — run one batch immediately');
    console.log('  npm start         — start the daily 7am scheduler\n');
    process.exit(0);
  } else {
    console.log('Fix the errors above before starting the scheduler.\n');
    process.exit(1);
  }
}

main();
