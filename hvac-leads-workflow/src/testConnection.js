/**
 * testConnection.js — run this BEFORE the first scheduled run to confirm
 * that both Apollo.io and Google Sheets are reachable.
 *
 * Usage:  node src/testConnection.js
 */

require('dotenv').config();
const axios = require('axios');
const config = require('./config');
const { verifyConnection } = require('./sheetsClient');
const logger = require('./logger');

async function testApollo() {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set in .env');
  }

  // Use the account profile endpoint — available on all plans, costs 0 credits
  const { data } = await axios.post(
    'https://api.apollo.io/api/v1/auth/health',
    { api_key: config.apollo.apiKey },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  if (data.is_logged_in === false) {
    throw new Error('Apollo API key is invalid or expired');
  }

  return 'Connected';
}

async function main() {
  logger.info('Running connection tests…');

  // ── Apollo ──────────────────────────────────────────────────────────────
  process.stdout.write('Apollo.io …  ');
  try {
    await testApollo();
    console.log('✓  Connected');
  } catch (err) {
    console.log('✗  FAILED');
    logger.error('Apollo connection test failed', err);
    logger.warn('Make sure APOLLO_API_KEY is correct in your .env file.');
  }

  // ── Google Sheets ───────────────────────────────────────────────────────
  process.stdout.write('Google Sheets … ');
  try {
    const title = await verifyConnection();
    console.log(`✓  Connected — spreadsheet: "${title}"`);
  } catch (err) {
    console.log('✗  FAILED');
    logger.error('Google Sheets connection test failed', err);
    logger.warn(
      'Checklist:\n' +
      '  1. credentials/service-account.json exists and is valid\n' +
      '  2. Google Sheets API is enabled in your GCP project\n' +
      '  3. The service account email has "Editor" access to the spreadsheet\n' +
      '  4. SPREADSHEET_ID in .env is correct'
    );
  }

  logger.info('Connection tests complete. Fix any failures above before running the workflow.');
}

main().catch(err => {
  logger.error('Unexpected error during connection test', err);
  process.exit(1);
});
