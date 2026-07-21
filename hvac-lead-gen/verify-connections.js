'use strict';

/**
 * Connection verification script — run this BEFORE the first scheduled run.
 *
 *   node verify-connections.js
 *
 * Checks:
 *   1. Apollo API key is valid and returns account info
 *   2. Google Sheets can read your spreadsheet header row
 *
 * Does NOT consume Apollo search credits or write anything to the sheet.
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');

async function verifyApollo() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    throw new Error('APOLLO_API_KEY is missing from .env');
  }

  const { data } = await axios.get('https://api.apollo.io/api/v1/auth/health', {
    params: { api_key: key },
    timeout: 10000,
  });

  // Apollo returns { is_logged_in: true } on success
  if (!data.is_logged_in) {
    throw new Error(`Apollo key rejected — is_logged_in: ${data.is_logged_in}`);
  }

  // Try to get plan info
  try {
    const profile = await axios.get('https://api.apollo.io/api/v1/users/me', {
      params: { api_key: key },
      timeout: 10000,
    });
    const user = profile.data?.user || {};
    return {
      email:          user.email || '(unavailable)',
      plan:           user.plan_type || '(unavailable)',
      creditsLeft:    user.num_credits_remaining ?? '(unavailable)',
    };
  } catch {
    return { email: '(unavailable)', plan: '(unavailable)', creditsLeft: '(unavailable)' };
  }
}

async function verifySheets() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is missing from .env');

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  let sheets;

  if (keyFile) {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyFile),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });
  } else {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
      throw new Error('No Google credentials. Set GOOGLE_SERVICE_ACCOUNT_PATH or OAuth env vars.');
    }
    const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    sheets = google.sheets({ version: 'v4', auth: oauth2 });
  }

  // Read only the header row to confirm access — no writes, no credit use
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Sheet1!A1:I1',
  });

  const headers = (res.data.values || [[]])[0] || [];
  return { spreadsheetId: sheetId, headers };
}

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Verification');
  console.log('══════════════════════════════════════════════\n');

  // ── Apollo ───────────────────────────────────────
  process.stdout.write('  Apollo.io  ... ');
  try {
    const info = await verifyApollo();
    console.log('✓ CONNECTED');
    console.log(`    Account : ${info.email}`);
    console.log(`    Plan    : ${info.plan}`);
    console.log(`    Credits : ${info.creditsLeft} remaining`);

    if (String(info.plan).toLowerCase().includes('free')) {
      console.log('\n  ⚠  WARNING: You are on the Apollo Free plan.');
      console.log('     The people-search endpoint used by this script requires a paid plan.');
      console.log('     Upgrade at: https://www.apollo.io/pricing\n');
    }
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`    ${err.message}`);
  }

  // ── Google Sheets ─────────────────────────────────
  process.stdout.write('\n  Google Sheets ... ');
  try {
    const info = await verifySheets();
    console.log('✓ CONNECTED');
    console.log(`    Sheet ID : ${info.spreadsheetId}`);
    console.log(`    Headers  : ${info.headers.join(' | ')}`);

    const expected = ['Date Added','Business Name','Owner First Name','Owner Last Name',
                      'Phone Number','City','Website','Called','Notes'];
    const missing = expected.filter((h, i) => (info.headers[i] || '').trim() !== h);
    if (missing.length) {
      console.log(`\n  ⚠  Header mismatch — expected: ${expected.join(' | ')}`);
      console.log(`     Got: ${info.headers.join(' | ')}`);
      console.log('     Fix row 1 of your sheet or update SHEET_TAB in lead-gen.js\n');
    }
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`    ${err.message}`);
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('  Next steps:');
  console.log('    node lead-gen.js       # manual test run');
  console.log('    node scheduler.js      # start 7am daily schedule');
  console.log('    pm2 start scheduler.js # keep alive in background');
  console.log('──────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('Verify script error:', err.message);
  process.exit(1);
});
