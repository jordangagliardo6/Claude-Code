/**
 * verify.js — Run this BEFORE the first scheduled execution to confirm
 * that Apollo.io and Google Sheets are both connected and working.
 *
 * Usage:  node verify.js
 */

require('dotenv').config();

const axios = require('axios');
const { getSheetsClient, getExistingBusinessNames, ensureHeader } = require('./sheets');
const config = require('./config');

async function verify() {
  let allOk = true;

  console.log('══════════════════════════════════════════════');
  console.log(' HVAC Leads — Connection Verification');
  console.log('══════════════════════════════════════════════\n');

  // ── 1. Check env vars ───────────────────────────────────────────────────
  console.log('1. Environment variables');
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    console.log('   ✗ APOLLO_API_KEY is not set');
    allOk = false;
  } else {
    console.log('   ✓ APOLLO_API_KEY is set');
  }

  const hasGoogleCreds =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!hasGoogleCreds) {
    console.log('   ✗ No Google credentials found (GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS)');
    allOk = false;
  } else {
    console.log('   ✓ Google credentials env var is set');
  }

  // ── 2. Test Apollo.io API ───────────────────────────────────────────────
  console.log('\n2. Apollo.io API');
  if (apolloKey) {
    try {
      const res = await axios.post(
        'https://api.apollo.io/v1/mixed_people/search',
        {
          api_key: apolloKey,
          q_keywords: 'HVAC heating Michigan',
          person_titles: ['Owner', 'President'],
          organization_num_employees_ranges: ['1,25'],
          per_page: 1,
          page: 1,
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
          timeout: 15000,
        }
      );
      const count = res.data?.pagination?.total_entries || res.data?.people?.length || '?';
      console.log(`   ✓ Connected — API returned ${count} result(s)`);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.error || err.message;
      console.log(`   ✗ Apollo API call failed (HTTP ${status || 'N/A'}): ${detail}`);
      allOk = false;
    }
  } else {
    console.log('   - Skipped (no API key)');
  }

  // ── 3. Test Google Sheets ───────────────────────────────────────────────
  console.log('\n3. Google Sheets');
  if (hasGoogleCreds) {
    try {
      const sheets = await getSheetsClient();
      await ensureHeader(sheets);
      const existing = await getExistingBusinessNames(sheets);
      console.log(`   ✓ Connected — sheet has ${existing.size} existing lead(s)`);
      console.log(`   ✓ Spreadsheet: https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}`);
    } catch (err) {
      console.log(`   ✗ Google Sheets failed: ${err.message}`);
      console.log('   Tip: Share the spreadsheet with your service account email.');
      allOk = false;
    }
  } else {
    console.log('   - Skipped (no credentials)');
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  if (allOk) {
    console.log(' ✓ All checks passed — ready to run!');
    console.log(' Start the scheduler:  node index.js');
    console.log(' Test one run now:     node index.js --run-now');
  } else {
    console.log(' ✗ Some checks failed — see above.');
    console.log(' Fix the issues, then run:  node verify.js');
  }
  console.log('══════════════════════════════════════════════\n');
}

verify().catch((err) => {
  console.error('Unexpected error during verification:', err);
  process.exit(1);
});
