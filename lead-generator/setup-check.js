/**
 * setup-check.js — Pre-flight connection test
 *
 * Run this BEFORE starting the scheduler to confirm both APIs are reachable.
 * It does NOT consume Apollo credits (no enrichment calls).
 *
 * Usage:  node setup-check.js
 */

'use strict';

require('dotenv').config();

const axios = require('axios');
const { testConnection, ensureHeaders } = require('./src/sheets');

// ─── Apollo test ──────────────────────────────────────────────────────────────

async function checkApollo() {
  console.log('\n[Apollo.io]');

  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in .env');
  }

  // Run a minimal, 1-result search — does not cost credits
  const res = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    {
      api_key: process.env.APOLLO_API_KEY,
      q_keywords: 'hvac michigan',
      per_page: 1,
      page: 1,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20_000,
    }
  );

  if (!res.data) throw new Error('Apollo returned an empty response.');

  const total = res.data.pagination?.total_entries ?? 0;
  console.log(`  ✓ Connected — Apollo shows ${total.toLocaleString()} total prospects for "hvac michigan"`);

  return true;
}

// ─── Google Sheets test ───────────────────────────────────────────────────────

async function checkSheets() {
  console.log('\n[Google Sheets]');

  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env');
  }

  const info = await testConnection();
  console.log(`  ✓ Connected — Spreadsheet: "${info.title}"`);
  console.log(`    Tabs available: ${info.sheets?.join(', ')}`);

  const targetTab = process.env.SHEET_TAB_NAME || 'Sheet1';
  if (!info.sheets?.includes(targetTab)) {
    console.warn(`  ⚠  Tab "${targetTab}" not found. Will use first tab or create one.`);
  }

  // Write headers if the sheet is brand new
  await ensureHeaders();
  console.log(`  ✓ Column headers verified in tab "${targetTab}"`);

  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('═'.repeat(60));
  console.log('  HVAC Lead Generator — Setup Check');
  console.log('═'.repeat(60));

  let apolloOk = false;
  let sheetsOk = false;

  try {
    apolloOk = await checkApollo();
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}`);
    if (err.response?.data) {
      console.error('  API error:', JSON.stringify(err.response.data, null, 2));
    }
  }

  try {
    sheetsOk = await checkSheets();
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`  Apollo.io     : ${apolloOk ? '✓ CONNECTED' : '✗ FAILED'}`);
  console.log(`  Google Sheets : ${sheetsOk ? '✓ CONNECTED' : '✗ FAILED'}`);
  console.log('═'.repeat(60));

  if (apolloOk && sheetsOk) {
    console.log('\n  All systems go!\n');
    console.log('  Next steps:');
    console.log('    node run-now.js   — run one cycle right now to confirm leads flow in');
    console.log('    node index.js     — start the daily 7 AM Eastern scheduler\n');
    process.exit(0);
  } else {
    console.log('\n  Fix the failed connection(s) above, then re-run: node setup-check.js\n');
    process.exit(1);
  }
})();
