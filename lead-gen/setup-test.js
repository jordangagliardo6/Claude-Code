'use strict';
// Run this BEFORE the first scheduled run to verify both APIs are reachable.
// Usage: node setup-test.js
require('dotenv').config();
const axios = require('axios');
const { testConnection } = require('./sheets');
const log = require('./logger');

let allPassed = true;

function pass(label) { log.success(`PASS — ${label}`); }
function fail(label, reason) { log.error(`FAIL — ${label}: ${reason}`); allPassed = false; }

// ── 1. Check required env vars ────────────────────────────────────────────────
console.log('\n── Checking environment variables ──');

for (const key of ['APOLLO_API_KEY', 'SPREADSHEET_ID']) {
  if (process.env[key]) pass(`${key} is set`);
  else fail(`${key} missing`, 'Add it to your .env file');
}

const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/service-account.json';
const fs = require('fs');
if (fs.existsSync(saPath)) pass(`Service account file found at ${saPath}`);
else fail('GOOGLE_SERVICE_ACCOUNT_PATH', `File not found at "${saPath}" — see README for setup steps`);

// ── 2. Test Apollo connection ─────────────────────────────────────────────────
console.log('\n── Testing Apollo.io API ──');
async function testApollo() {
  try {
    const res = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      { per_page: 1, page: 1, q_keywords: 'hvac michigan' },
      {
        headers: {
          'X-Api-Key': process.env.APOLLO_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      }
    );
    const total = res.data?.pagination?.total_entries ?? '?';
    pass(`Apollo API reachable — test query matched ${total} total records`);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) fail('Apollo API', 'Invalid API key (401 Unauthorized)');
    else if (status === 422) fail('Apollo API', 'Request rejected (422) — check your plan supports People Search');
    else fail('Apollo API', err.message);
  }
}

// ── 3. Test Google Sheets connection ──────────────────────────────────────────
console.log('\n── Testing Google Sheets API ──');
async function testSheets() {
  try {
    const data = await testConnection();
    const header = data.values?.[0] ?? [];
    if (header.length > 0) {
      pass(`Google Sheets connected — header row: [${header.join(', ')}]`);
    } else {
      pass('Google Sheets connected — sheet appears empty (header will be written on first run)');
    }
  } catch (err) {
    if (err.message.includes('SPREADSHEET_ID')) {
      fail('Google Sheets', err.message);
    } else if (err.code === 'ENOENT') {
      fail('Google Sheets', `Service account file not found — check GOOGLE_SERVICE_ACCOUNT_PATH`);
    } else if (err.code === 403) {
      fail('Google Sheets', 'Permission denied — share the spreadsheet with the service account email');
    } else {
      fail('Google Sheets', err.message);
    }
  }
}

(async () => {
  await testApollo();
  await testSheets();

  console.log('\n' + '─'.repeat(50));
  if (allPassed) {
    log.success('All checks passed! You are ready to run the scheduler.');
    console.log('\nTo start the scheduler:    node index.js');
    console.log('To run a single fetch now: node index.js --run-once\n');
  } else {
    log.error('Some checks failed. Fix the issues above before running the scheduler.');
    process.exit(1);
  }
})();
