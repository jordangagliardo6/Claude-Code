/**
 * First-run verification script.
 * Run:  node src/verify.js
 *
 * Checks that:
 *   1. .env is loaded and required keys exist
 *   2. Apollo.io API key is valid (makes a minimal test search)
 *   3. Google credentials exist and can authenticate
 *   4. The target spreadsheet is accessible
 */

require('dotenv').config();

const axios = require('axios');
const { getAuthClient } = require('./sheets');
const { google } = require('googleapis');

const APOLLO_KEY    = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function verify() {
  let pass = true;

  // ── 1. Environment ──────────────────────────────────────────────────────────
  console.log('\n[1/3] Checking environment variables...');
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  for (const key of required) {
    if (process.env[key]) {
      console.log(`  ✓  ${key} is set`);
    } else {
      console.error(`  ✗  ${key} is MISSING`);
      pass = false;
    }
  }

  if (!pass) {
    console.error('\nFix the missing .env values before continuing.');
    process.exit(1);
  }

  // ── 2. Apollo.io ────────────────────────────────────────────────────────────
  console.log('\n[2/3] Testing Apollo.io connection...');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        person_titles: ['Owner'],
        person_locations: ['Kalamazoo, Michigan, United States'],
        organization_num_employees_ranges: ['1,25'],
        has_phone: true,
        per_page: 1,
      },
      {
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_KEY },
        timeout: 15000,
      }
    );

    const count = res.data?.people?.length ?? 0;
    console.log(`  ✓  Apollo API key valid — test search returned ${count} result(s)`);
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message ?? err.message;
    console.error(`  ✗  Apollo error: HTTP ${status} — ${msg}`);
    if (status === 401 || status === 403) {
      console.error('     Check your APOLLO_API_KEY value.');
    }
    pass = false;
  }

  // ── 3. Google Sheets ────────────────────────────────────────────────────────
  console.log('\n[3/3] Testing Google Sheets connection...');
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log(`  ✓  Google Sheets connected — spreadsheet: "${meta.data.properties.title}"`);

    const sheetNames = meta.data.sheets.map((s) => s.properties.title).join(', ');
    console.log(`     Sheets available: ${sheetNames}`);
  } catch (err) {
    console.error(`  ✗  Google Sheets error: ${err.message}`);
    if (err.message.includes('credentials.json')) {
      console.error('     Copy credentials.json.example → credentials.json and fill in your OAuth2 values.');
    }
    pass = false;
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  if (pass) {
    console.log('All checks passed. Run `npm run test-run` to execute the first lead pull.');
  } else {
    console.log('Some checks FAILED. Fix the issues above before the first scheduled run.');
  }
  console.log('='.repeat(50) + '\n');

  process.exit(pass ? 0 : 1);
}

verify().catch((err) => {
  console.error('Unexpected error during verification:', err);
  process.exit(1);
});
