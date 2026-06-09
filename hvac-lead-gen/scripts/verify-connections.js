// Run this before the first scheduled run to confirm both APIs are working.
// Usage: node scripts/verify-connections.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const axios = require('axios');
const { google } = require('googleapis');
const sheets = require('../src/sheets');
const logger = require('../src/logger');

async function verifyApollo() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    throw new Error('APOLLO_API_KEY is missing or still set to the placeholder value.');
  }

  // Lightweight API call to validate the key — just check the user profile
  const response = await axios.get('https://api.apollo.io/v1/auth/health', {
    headers: { 'X-Api-Key': apiKey },
    timeout: 10000,
  });

  if (response.data?.is_logged_in === false) {
    throw new Error('Apollo API key is invalid or expired.');
  }

  logger.info('✓ Apollo.io connection verified.');
}

async function verifySheets() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId || spreadsheetId === 'your_spreadsheet_id_here') {
    throw new Error('GOOGLE_SPREADSHEET_ID is missing or still set to the placeholder value.');
  }

  const auth = await sheets.getAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth });

  const response = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const title = response.data.properties?.title || '(untitled)';

  logger.info(`✓ Google Sheets connection verified. Spreadsheet: "${title}"`);

  await sheets.ensureHeaders(auth);
  logger.info('✓ Sheet headers confirmed.');
}

async function main() {
  console.log('\n=== HVAC Lead Gen — Connection Verification ===\n');

  let allPassed = true;

  try {
    await verifyApollo();
  } catch (err) {
    logger.error(`Apollo check failed: ${err.message}`);
    allPassed = false;
  }

  try {
    await verifySheets();
  } catch (err) {
    logger.error(`Google Sheets check failed: ${err.message}`);
    allPassed = false;
  }

  if (allPassed) {
    console.log('\n✅ All connections verified. You are ready to run:\n');
    console.log('  node index.js --run-now   ← immediate test run');
    console.log('  node index.js             ← start the daily 7 AM scheduler\n');
  } else {
    console.log('\n❌ One or more connections failed. Fix the errors above, then re-run:\n');
    console.log('  node scripts/verify-connections.js\n');
    process.exit(1);
  }
}

main();
