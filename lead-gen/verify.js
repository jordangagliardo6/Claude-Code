'use strict';
/**
 * Pre-flight check — run this BEFORE the first scheduled run to confirm
 * both Apollo and Google Sheets are properly connected.
 *
 *   npm run verify
 */
require('dotenv').config();
const axios  = require('axios');
const { getExistingBusinessNames, ensureHeaders } = require('./sheets');

async function verify() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Pre-flight Connection Check');
  console.log('══════════════════════════════════════════════════════\n');

  let apolloOk = false;
  let sheetsOk = false;

  // ── Apollo.io ─────────────────────────────────────────────────────────────
  process.stdout.write('1. Apollo.io API ... ');
  if (!process.env.APOLLO_API_KEY) {
    console.log('FAIL\n   APOLLO_API_KEY not set in .env');
  } else {
    try {
      const { data } = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        {
          api_key: process.env.APOLLO_API_KEY,
          person_titles: ['owner'],
          organization_locations: ['Kalamazoo, Michigan, United States'],
          organization_sic_codes: ['1711'],
          per_page: 1,
          page: 1,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
      );
      const total = data.pagination?.total_entries ?? '?';
      console.log(`OK  (${total} total HVAC owner contacts found in database)`);
      apolloOk = true;
    } catch (err) {
      const detail = err.response?.data?.message || err.message;
      console.log(`FAIL\n   ${detail}`);
    }
  }

  // ── Google Sheets ─────────────────────────────────────────────────────────
  process.stdout.write('2. Google Sheets ... ');
  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    console.log('FAIL\n   GOOGLE_SPREADSHEET_ID not set in .env');
  } else {
    try {
      await ensureHeaders();
      const names = await getExistingBusinessNames();
      console.log(`OK  (${names.size} existing business${names.size !== 1 ? 'es' : ''} in sheet)`);
      sheetsOk = true;
    } catch (err) {
      console.log(`FAIL\n   ${err.message}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  if (apolloOk && sheetsOk) {
    console.log('All systems connected.');
    console.log('\nYou\'re ready to go:');
    console.log('  npm run run-now   ← run one full cycle right now (recommended first test)');
    console.log('  npm start         ← start the scheduler (7 AM Eastern, daily)');
  } else {
    const failed = [!apolloOk && 'Apollo', !sheetsOk && 'Google Sheets'].filter(Boolean);
    console.log(`Fix the issue${failed.length > 1 ? 's' : ''} above (${failed.join(', ')}) then re-run: npm run verify`);
    process.exit(1);
  }
  console.log('══════════════════════════════════════════════════════\n');
}

verify();
