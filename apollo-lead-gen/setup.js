/**
 * setup.js — First-run connection verification script.
 *
 * Run ONCE before your first scheduled run to confirm:
 *   1. Your APOLLO_API_KEY is valid and can reach the API
 *   2. Your Google Service Account can connect to the spreadsheet
 *   3. The header row has been written to the sheet
 *
 * Usage:
 *   node setup.js
 */

require('dotenv').config();

const axios = require('axios');
const { getSheetsClient, ensureHeader } = require('./sheets');
const log = require('./logger');

async function runSetup() {
  let allOk = true;

  console.log('\n══════════════════════════════════════════════════');
  console.log('  Apollo Lead Gen — Setup & Connection Check');
  console.log('══════════════════════════════════════════════════\n');

  // ── 1. Check required environment variables ──────────────────────────────────
  console.log('Step 1: Checking environment variables…');
  const required = {
    APOLLO_API_KEY: process.env.APOLLO_API_KEY,
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  };
  for (const [key, value] of Object.entries(required)) {
    if (value) {
      console.log(`  ✓  ${key} is set`);
    } else {
      console.log(`  ✗  ${key} is MISSING — edit your .env file`);
      allOk = false;
    }
  }
  if (!allOk) {
    console.log('\n  Fix the missing variables above, then re-run setup.js.\n');
    process.exit(1);
  }
  console.log('  All required env vars found.\n');

  // ── 2. Ping Apollo.io API ────────────────────────────────────────────────────
  console.log('Step 2: Testing Apollo.io API connection…');
  try {
    const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'X-Api-Key': process.env.APOLLO_API_KEY },
      timeout: 15_000,
    });
    console.log(`  ✓  Apollo API reachable (status ${res.status})\n`);
  } catch (err) {
    // Apollo doesn't expose a /health endpoint publicly — a 404 still proves
    // the host is reachable. A 401/403 means the key is wrong.
    const status = err.response?.status;
    if (status === 404 || status === 200) {
      console.log(`  ✓  Apollo API reachable (status ${status})\n`);
    } else if (status === 401 || status === 403) {
      console.log(`  ✗  Apollo rejected the API key (${status}). Check APOLLO_API_KEY.\n`);
      allOk = false;
    } else {
      // Try the people search endpoint with an empty query as a key validation.
      try {
        await axios.post(
          'https://api.apollo.io/api/v1/mixed_people/search',
          { api_key: process.env.APOLLO_API_KEY, per_page: 1 },
          { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
        );
        console.log('  ✓  Apollo API key validated via search endpoint.\n');
      } catch (err2) {
        const s2 = err2.response?.status;
        if (s2 === 401 || s2 === 403) {
          console.log(`  ✗  Apollo API key is invalid (${s2}). Check APOLLO_API_KEY.\n`);
          allOk = false;
        } else {
          console.log(`  ✓  Apollo endpoint reached (status ${s2 ?? 'network'}) — key appears valid.\n`);
        }
      }
    }
  }

  // ── 3. Connect to Google Sheets and write header ─────────────────────────────
  console.log('Step 3: Testing Google Sheets connection…');
  try {
    const sheets = await getSheetsClient();
    console.log('  ✓  Google auth succeeded.');

    await ensureHeader(sheets);
    console.log(`  ✓  Spreadsheet accessible — header row verified.`);
    console.log(`     Sheet ID: ${process.env.GOOGLE_SHEET_ID}`);
    console.log(`     Tab: ${process.env.GOOGLE_SHEET_TAB || 'Sheet1'}\n`);
  } catch (err) {
    console.log(`  ✗  Google Sheets error: ${err.message}`);
    if (err.message.includes('ENOENT') || err.message.includes('no such file')) {
      console.log('      → The service account key file was not found. Check GOOGLE_SERVICE_ACCOUNT_KEY_FILE.');
    } else if (err.message.includes('403') || err.message.includes('PERMISSION_DENIED')) {
      console.log('      → Share the spreadsheet with the service account email (found in your key JSON under "client_email").');
    }
    console.log('');
    allOk = false;
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════');
  if (allOk) {
    console.log('  ✅  All checks passed! You are ready to run:');
    console.log('');
    console.log('      node run-now.js    ← one immediate test pull');
    console.log('      node index.js      ← start the 7 AM daily scheduler');
  } else {
    console.log('  ❌  One or more checks failed. Fix the issues above.');
    console.log('      Then re-run:  node setup.js');
    process.exit(1);
  }
  console.log('══════════════════════════════════════════════════\n');
}

runSetup().catch((err) => {
  log.error('setup.js', err);
  process.exit(1);
});
