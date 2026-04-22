// Pre-flight check — run this BEFORE the first scheduled run to confirm that
// both Apollo.io and Google Sheets are reachable and correctly configured.
//
//   npm run verify
//
require('dotenv').config();
const axios = require('axios');
const { getAuthClient, ensureHeaders } = require('./sheets');

const CHECK = '  ✓';
const FAIL  = '  ✗';

async function verify() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Verification');
  console.log('════════════════════════════════════════════════════════\n');

  let allPassed = true;

  // ── 1. Environment variables ───────────────────────────────────────────────
  console.log('Step 1: Environment variables');
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  for (const key of required) {
    if (process.env[key]) {
      console.log(`${CHECK} ${key} is set`);
    } else {
      console.log(`${FAIL} ${key} is NOT set — add it to your .env file`);
      allPassed = false;
    }
  }

  const optionals = ['ALERT_EMAIL', 'GOOGLE_SHEET_NAME'];
  for (const key of optionals) {
    if (process.env[key]) {
      console.log(`${CHECK} ${key} = "${process.env[key]}" (optional)`);
    } else {
      console.log(`  - ${key} not set (optional, skipping)`);
    }
  }

  // ── 2. Apollo.io ───────────────────────────────────────────────────────────
  console.log('\nStep 2: Apollo.io API');
  if (!process.env.APOLLO_API_KEY) {
    console.log(`${FAIL} Skipped — APOLLO_API_KEY not set`);
    allPassed = false;
  } else {
    try {
      const res = await axios.post(
        'https://api.apollo.io/v1/mixed_people/search',
        {
          api_key: process.env.APOLLO_API_KEY,
          page: 1,
          per_page: 1,
          person_titles: ['Owner'],
          organization_locations: ['Michigan, United States'],
          organization_num_employees_ranges: ['1,25'],
          q_organization_keyword_tags: ['hvac'],
        },
        {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          timeout: 15_000,
        }
      );

      const total = res.data?.pagination?.total_entries ?? 0;
      const sample = res.data?.people?.[0];
      console.log(`${CHECK} Connected to Apollo.io`);
      console.log(`  ↳ ${total} total matching contacts in Apollo's database`);
      if (sample) {
        console.log(`  ↳ Sample: ${sample.first_name} ${sample.last_name} — ${sample.title || 'no title'} at ${sample.organization?.name || 'unknown company'}`);
      }
    } catch (err) {
      const detail = err.response?.data?.message || err.message;
      console.log(`${FAIL} Apollo.io failed: ${detail}`);
      if (err.response?.status === 401) {
        console.log('  ↳ Check that APOLLO_API_KEY is correct');
      }
      allPassed = false;
    }
  }

  // ── 3. Google Sheets ───────────────────────────────────────────────────────
  console.log('\nStep 3: Google Sheets');
  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    console.log(`${FAIL} Skipped — GOOGLE_SPREADSHEET_ID not set`);
    allPassed = false;
  } else {
    try {
      const auth = await getAuthClient();
      await ensureHeaders(auth, process.env.GOOGLE_SPREADSHEET_ID);
      console.log(`${CHECK} Google Sheets connected`);
      console.log(`  ↳ Spreadsheet ID: ${process.env.GOOGLE_SPREADSHEET_ID}`);
      console.log(`  ↳ Sheet tab: ${process.env.GOOGLE_SHEET_NAME || 'Sheet1'}`);
      console.log(`  ↳ Headers verified / written`);
    } catch (err) {
      console.log(`${FAIL} Google Sheets failed: ${err.message}`);
      if (err.message.includes('credentials not found')) {
        console.log('  ↳ Download credentials.json from Google Cloud Console and place');
        console.log('    it at:  credentials/credentials.json');
      }
      allPassed = false;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  ALL CHECKS PASSED — Ready to run!\n');
    console.log('  Run once now:         npm run run-now');
    console.log('  Start the scheduler:  npm start');
  } else {
    console.log('  SOME CHECKS FAILED — Fix the issues above before running.\n');
  }
  console.log('════════════════════════════════════════════════════════\n');

  if (!allPassed) process.exit(1);
}

verify().catch(err => {
  console.error('\nVerification script error:', err.message);
  process.exit(1);
});
