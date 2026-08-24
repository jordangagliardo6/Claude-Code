/**
 * verify.js — run this before the first scheduled execution to confirm
 * that both Apollo and Google Sheets are connected and working.
 *
 * Usage:
 *   node verify.js
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo';

async function verify() {
  let passed = 0;
  let failed = 0;

  console.log('\n══════════════════════════════════════════');
  console.log(' HVAC Lead Gen — Connection Verification');
  console.log('══════════════════════════════════════════\n');

  // ── Check 1: Required environment variables ──────────────────────────────
  console.log('[1] Checking environment variables...');
  const required = [
    'APOLLO_API_KEY',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.log(`   ✗ Missing: ${missing.join(', ')}`);
    console.log('   → Copy .env.example to .env and fill in the values.\n');
    failed++;
  } else {
    console.log('   ✓ All required env vars present\n');
    passed++;
  }

  // ── Check 2: Apollo API key validity ────────────────────────────────────
  console.log('[2] Testing Apollo.io API key...');
  try {
    // The /account endpoint is available on all plans and doesn't consume credits
    const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'Cache-Control': 'no-cache', 'X-Api-Key': process.env.APOLLO_API_KEY },
      timeout: 10000,
    });
    if (res.data?.is_logged_in) {
      console.log('   ✓ Apollo API key is valid and authenticated\n');
      passed++;
    } else {
      console.log('   ✗ Apollo responded but is_logged_in was false\n');
      failed++;
    }
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;
    if (status === 401) {
      console.log('   ✗ Apollo: Invalid API key (401 Unauthorized)\n');
    } else if (status === 403) {
      console.log('   ✗ Apollo: API access denied — paid plan required for people search\n');
      console.log('   → Upgrade at https://www.apollo.io/pricing (Basic plan = $49/mo)\n');
    } else {
      console.log(`   ✗ Apollo error: ${msg}\n`);
    }
    failed++;
  }

  // ── Check 3: Apollo plan — people search access ──────────────────────────
  console.log('[3] Testing Apollo people search (requires paid plan)...');
  try {
    const res = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        person_titles: ['Owner'],
        organization_locations: ['Michigan, United States'],
        per_page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const count = res.data?.people?.length ?? 0;
    console.log(`   ✓ People search works — got ${count} result(s)\n`);
    passed++;
  } catch (err) {
    const errData = err.response?.data;
    if (errData?.error_code === 'API_INACCESSIBLE') {
      console.log('   ✗ People search blocked — Apollo free plan does not include API access');
      console.log('   → Upgrade to Basic ($49/mo) at https://www.apollo.io/pricing\n');
    } else {
      console.log(`   ✗ People search failed: ${errData?.error || err.message}\n`);
    }
    failed++;
  }

  // ── Check 4: Google Sheets read ──────────────────────────────────────────
  console.log('[4] Testing Google Sheets connection...');
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:I2',
    });
    const rows = res.data.values || [];
    console.log(`   ✓ Google Sheets connected — read ${rows.length} row(s) from Sheet1`);
    console.log(`   Sheet ID: ${SPREADSHEET_ID}\n`);
    passed++;
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('invalid_grant') || msg.includes('UNAUTHENTICATED')) {
      console.log('   ✗ Google auth failed — check service account credentials\n');
    } else if (msg.includes('not found') || msg.includes('404')) {
      console.log(`   ✗ Spreadsheet not found: ${SPREADSHEET_ID}`);
      console.log('   → Set GOOGLE_SHEET_ID in .env to the correct sheet ID\n');
    } else if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
      console.log('   ✗ Permission denied — share the sheet with your service account email\n');
    } else {
      console.log(`   ✗ Sheets error: ${msg}\n`);
    }
    failed++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════');
  console.log(` Results: ${passed} passed / ${failed} failed`);
  console.log('══════════════════════════════════════════\n');

  if (failed === 0) {
    console.log('✅ All checks passed — you are ready to run the scheduler!\n');
    console.log('   Start the scheduler:  node index.js');
    console.log('   Trigger immediately:  node index.js --run-now\n');
  } else {
    console.log('⚠️  Fix the issues above, then re-run: node verify.js\n');
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('Verification script crashed:', err.message);
  process.exit(1);
});
