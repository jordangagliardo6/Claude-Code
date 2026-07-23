'use strict';

// Run this BEFORE the first scheduled run to verify both APIs are working.
// Usage: node test-connection.js

require('dotenv').config();
const axios      = require('axios');
const { testConnection: testSheets } = require('./src/sheets');
const log        = require('./src/logger');

async function main() {
  let allOk = true;

  // ── 1. Apollo.io ──────────────────────────────────────────────────────────
  log.info('Testing Apollo.io connection…');
  const apolloKey = process.env.APOLLO_API_KEY;

  if (!apolloKey) {
    log.error('APOLLO_API_KEY is not set in .env');
    allOk = false;
  } else {
    try {
      const { data } = await axios.post(
        'https://api.apollo.io/v1/auth/health',
        { api_key: apolloKey },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
      );

      if (data?.is_logged_in) {
        log.info(`  ✓ Apollo connected — account: ${data.user?.email || 'unknown'}`);
      } else {
        // Fallback: a minimal search to verify the key works
        const search = await axios.post(
          'https://api.apollo.io/v1/mixed_people/search',
          { api_key: apolloKey, page: 1, per_page: 1, person_titles: ['Owner'],
            organization_locations: ['Michigan, United States'] },
          { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
        );
        const count = search.data?.pagination?.total_entries ?? 0;
        log.info(`  ✓ Apollo connected — test query returned ${count} total results`);
      }
    } catch (err) {
      log.error(`  ✗ Apollo connection failed: ${err.response?.data?.message || err.message}`);
      if (err.response?.status === 401) {
        log.error('    → Your API key is invalid. Verify it at: https://app.apollo.io/#/settings/integrations/api');
      }
      allOk = false;
    }
  }

  // ── 2. Google Sheets ──────────────────────────────────────────────────────
  log.info('Testing Google Sheets connection…');

  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    log.error('GOOGLE_SPREADSHEET_ID is not set in .env');
    allOk = false;
  } else if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    log.error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set in .env');
    allOk = false;
  } else {
    try {
      const info = await testSheets();
      log.info(`  ✓ Google Sheets connected`);
      log.info(`    Spreadsheet: "${info.spreadsheetTitle}"`);
      log.info(`    URL: ${info.url}`);

      if (info.sheetExists) {
        log.info(`    Tab "${info.sheetName}" found ✓`);
      } else {
        log.warn(`    Tab "${info.sheetName}" does NOT exist — the sheet must be named exactly "${info.sheetName}"`);
        log.warn(`    Update GOOGLE_SHEET_NAME in .env or rename the tab in Google Sheets`);
      }
    } catch (err) {
      log.error(`  ✗ Google Sheets connection failed: ${err.message}`);

      if (err.message.includes('not found')) {
        log.error('    → Key file missing. Download from Google Cloud Console → Service Accounts → Keys');
      } else if (err.message.includes('permission') || err.message.includes('403')) {
        log.error('    → Share the spreadsheet with your service account email (Editor access)');
        log.error('      Find the email in service-account.json → "client_email" field');
      } else if (err.message.includes('SPREADSHEET_ID')) {
        log.error('    → Copy the ID from the spreadsheet URL:');
        log.error('      https://docs.google.com/spreadsheets/d/<ID>/edit');
      }
      allOk = false;
    }
  }

  // ── Result ────────────────────────────────────────────────────────────────
  console.log('');
  if (allOk) {
    log.info('✓ All connections OK — safe to start the scheduler with: node index.js');
  } else {
    log.error('✗ One or more connections failed — fix the issues above before starting');
    process.exit(1);
  }
}

main().catch(err => {
  log.error('Unexpected error during connection test', err);
  process.exit(1);
});
