'use strict';

/**
 * setup-check.js — First-run connection verifier
 *
 * Run this BEFORE starting the scheduler to confirm:
 *   1. Your Apollo API key is valid
 *   2. Your Google service account key file exists and is readable
 *   3. The Google Sheet is accessible and writable
 *
 * Usage:
 *   npm run setup
 *   node setup-check.js
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const { searchHVACPeople }          = require('./lib/apollo');
const { createAuthClient, getExistingBusinessNames, ensureHeaderRow } = require('./lib/sheets');

const {
  APOLLO_API_KEY,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
  GOOGLE_SPREADSHEET_ID,
  GOOGLE_SHEET_NAME = 'Leads',
} = process.env;

async function check() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║  HVAC Lead Gen — First-Run Connection Check  ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  let allOk = true;

  // ── Check 1: .env file ──────────────────────────────────────────────────────
  console.log('1. Environment file (.env)');
  if (!fs.existsSync(path.resolve('.env'))) {
    console.log('   ⚠️  .env file not found — using system environment variables');
    console.log('      (Run "cp .env.example .env" and fill in values if you haven\'t yet)\n');
  } else {
    console.log('   ✅ .env file found\n');
  }

  // ── Check 2: Apollo API key ─────────────────────────────────────────────────
  console.log('2. Apollo.io API Key');
  if (!APOLLO_API_KEY) {
    console.error('   ❌ APOLLO_API_KEY is not set\n');
    allOk = false;
  } else {
    try {
      const results = await searchHVACPeople(APOLLO_API_KEY, 1);
      console.log(`   ✅ Apollo connected — test search returned ${results.length} result(s)\n`);
    } catch (err) {
      const status = err.response?.status;
      const msg    = err.response?.data?.message || err.message;
      if (status === 401 || status === 403) {
        console.error(`   ❌ Invalid or unauthorized Apollo API key (HTTP ${status}): ${msg}\n`);
      } else {
        console.error(`   ❌ Apollo API error (HTTP ${status || 'unknown'}): ${msg}\n`);
      }
      allOk = false;
    }
  }

  // ── Check 3: Google service account JSON key file ───────────────────────────
  console.log('3. Google Service Account Key File');
  let serviceAccountEmail = null;

  if (!GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    console.error('   ❌ GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set\n');
    allOk = false;
  } else {
    const keyPath = path.resolve(GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
    if (!fs.existsSync(keyPath)) {
      console.error(`   ❌ Key file not found at: ${keyPath}`);
      console.error('      → Download it from Google Cloud Console → IAM → Service Accounts → Keys\n');
      allOk = false;
    } else {
      try {
        const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        serviceAccountEmail = keyData.client_email;
        console.log(`   ✅ Key file found`);
        console.log(`   📧 Service account email: ${serviceAccountEmail}`);
        console.log('   ⚠️  Make sure this email has EDITOR access to your spreadsheet\n');
      } catch (err) {
        console.error(`   ❌ Could not parse key file: ${err.message}\n`);
        allOk = false;
      }
    }
  }

  // ── Check 4: Google Sheets connection ───────────────────────────────────────
  console.log('4. Google Sheets Connection');
  if (!GOOGLE_SPREADSHEET_ID) {
    console.error('   ❌ GOOGLE_SPREADSHEET_ID is not set\n');
    allOk = false;
  } else if (serviceAccountEmail) {
    try {
      const auth = createAuthClient(GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
      await ensureHeaderRow(auth, GOOGLE_SPREADSHEET_ID, GOOGLE_SHEET_NAME);
      const existing = await getExistingBusinessNames(auth, GOOGLE_SPREADSHEET_ID, GOOGLE_SHEET_NAME);
      console.log(`   ✅ Google Sheets connected`);
      console.log(`   📋 Tab "${GOOGLE_SHEET_NAME}" found — ${existing.size} existing lead(s)\n`);
    } catch (err) {
      console.error(`   ❌ Google Sheets error: ${err.message}`);
      if (err.message?.includes('not found') || err.code === 404) {
        console.error(`      → Check that GOOGLE_SPREADSHEET_ID is correct`);
        console.error(`        (copy the ID from the spreadsheet URL)`);
      } else if (err.message?.includes('permission') || err.code === 403) {
        console.error(`      → Share the spreadsheet with the service account email:`);
        console.error(`        ${serviceAccountEmail}`);
        console.error(`        Go to spreadsheet → Share → paste that email → set Editor`);
      }
      console.error('');
      allOk = false;
    }
  } else {
    console.log('   ⏭  Skipped (fix service account key first)\n');
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════');
  if (allOk) {
    console.log('\n✅ All checks passed! You\'re ready to launch.\n');
    console.log('Next steps:');
    console.log('  npm start                 Start scheduler (runs at 7:00 AM ET daily)');
    console.log('  npm run run-now           Run immediately + keep scheduler running');
    console.log('  node index.js --run-now   Same as above, verbose\n');
  } else {
    console.log('\n❌ One or more checks failed. Fix the issues above, then re-run:\n');
    console.log('  npm run setup\n');
    process.exit(1);
  }
}

check().catch(err => {
  console.error('\nUnexpected error during setup check:', err.message);
  process.exit(1);
});
