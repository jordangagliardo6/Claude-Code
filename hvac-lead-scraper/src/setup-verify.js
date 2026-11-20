/**
 * Setup verification script — run this BEFORE the first scheduled run
 * to confirm Apollo.io and Google Sheets are both connected and working.
 *
 * Usage: node src/setup-verify.js
 */

require('dotenv').config();
const axios = require('axios');
const { testConnection, getSheetsClient, ensureHeaders } = require('./sheets');
const config = require('./config');

const CHECK = '✓';
const FAIL  = '✗';

function ok(msg)   { console.log(`  ${CHECK} ${msg}`); }
function fail(msg) { console.error(`  ${FAIL} ${msg}`); }

async function verify() {
  console.log('\n========================================');
  console.log('HVAC Lead Scraper — Setup Verification');
  console.log('========================================\n');

  let allPassed = true;

  // ── 1. Environment Variables ──────────────────────────────────────────────
  console.log('1. Checking environment variables...');

  const checks = [
    ['APOLLO_API_KEY',         config.apollo.apiKey],
    ['GOOGLE_SHEET_ID',        config.sheets.spreadsheetId],
    ['GOOGLE_CREDENTIALS_PATH',config.sheets.credentialsPath],
  ];

  for (const [name, value] of checks) {
    if (value && value !== `your_${name.toLowerCase()}_here`) {
      ok(`${name} is set`);
    } else {
      fail(`${name} is missing or still set to the example value`);
      allPassed = false;
    }
  }

  if (config.notify.from && config.notify.password && config.notify.to) {
    ok('Email notification credentials are set (optional)');
  } else {
    console.log('  - Email notification skipped (ALERT_EMAIL_* not fully configured — this is optional)');
  }

  // ── 2. Apollo.io API ──────────────────────────────────────────────────────
  console.log('\n2. Testing Apollo.io API connection...');

  if (!config.apollo.apiKey) {
    fail('Skipped — APOLLO_API_KEY not set');
    allPassed = false;
  } else {
    try {
      const res = await axios.post(
        `${config.apollo.baseUrl}/mixed_people/search`,
        {
          api_key: config.apollo.apiKey,
          person_titles: ['Owner'],
          person_locations: ['Kalamazoo, Michigan, United States'],
          q_organization_keyword_tags: ['hvac'],
          organization_num_employees_ranges: ['1,25'],
          page: 1,
          per_page: 1,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      const count = res.data?.pagination?.total_entries || 0;
      ok(`Apollo.io API key is valid`);
      ok(`Test search returned (total available): ${count} contacts`);

      if (count === 0) {
        console.log('  ⚠  No results for the test query — your filters may be too narrow or');
        console.log('     your plan may have no remaining credits. Check your Apollo dashboard.');
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      fail(`Apollo.io error (HTTP ${status || 'unknown'}): ${msg}`);
      allPassed = false;
    }
  }

  // ── 3. Google Sheets ──────────────────────────────────────────────────────
  console.log('\n3. Testing Google Sheets connection...');

  if (!config.sheets.spreadsheetId || !config.sheets.credentialsPath) {
    fail('Skipped — GOOGLE_SHEET_ID or GOOGLE_CREDENTIALS_PATH not set');
    allPassed = false;
  } else {
    try {
      const sheetMeta = await testConnection();
      ok(`Connected to spreadsheet: "${sheetMeta.properties?.title}"`);
      ok(`Spreadsheet ID: ${sheetMeta.spreadsheetId}`);
    } catch (err) {
      fail(`Google Sheets connection failed: ${err.message}`);
      if (err.message.includes('not found')) {
        console.log('     → Check that GOOGLE_SHEET_ID is correct');
      } else if (err.message.includes('credentials')) {
        console.log('     → Check that GOOGLE_CREDENTIALS_PATH points to a valid service account JSON');
      } else if (err.message.includes('permission') || err.message.includes('403')) {
        console.log('     → Share the spreadsheet with the service account email in your credentials JSON');
      }
      allPassed = false;
    }

    if (allPassed) {
      // Try to ensure headers exist
      try {
        const sheets = await getSheetsClient();
        await ensureHeaders(sheets);
        ok('"Leads" sheet has correct header row');
      } catch (err) {
        fail(`Could not write headers: ${err.message}`);
        allPassed = false;
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n========================================');
  if (allPassed) {
    console.log('All checks passed! You are ready to run.');
    console.log('');
    console.log('  Start the scheduler : node src/index.js');
    console.log('  Run once immediately: node src/run-once.js');
  } else {
    console.log('Some checks failed. Fix the issues above, then run this script again.');
  }
  console.log('========================================\n');

  process.exit(allPassed ? 0 : 1);
}

verify();
