'use strict';

/**
 * Connection test — run this BEFORE your first scheduled run.
 *
 *   node test-connection.js
 *
 * Verifies:
 *   1. APOLLO_API_KEY is set and can authenticate
 *   2. Google Sheets credentials are valid and the target sheet is accessible
 *   3. (Optional) SMTP email delivery
 *
 * Does NOT write any data to the sheet or consume Apollo credits.
 */

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');

const SPREADSHEET_ID = '1Wm5m8AWGeZJDdBnHNxtd0SosrrEH_aQrzZmYUXnTMoE';
const SHEET_NAME = 'Sheet1';

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  ✗  ${label}`);
  if (detail) console.log(`       → ${detail}`);
  failed++;
}

// ── Test 1: Apollo API key ────────────────────────────────────────────────────

async function testApollo() {
  console.log('\n[1/3] Testing Apollo.io connection...');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY', 'Not set or still contains placeholder value in .env');
    return;
  }
  ok('APOLLO_API_KEY is set');

  try {
    // Light-weight call: fetch account profile (no credit cost)
    const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    });

    if (res.status === 200) {
      ok(`Apollo API reachable (status ${res.status})`);
    } else {
      fail('Apollo API health check', `Unexpected status ${res.status}`);
    }
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    if (status === 401 || status === 403) {
      fail('Apollo API authentication', `${status} — check your API key`);
    } else if (status === 404) {
      // /auth/health may not exist on all plans — do a minimal search instead
      try {
        await axios.post(
          'https://api.apollo.io/api/v1/mixed_people/search',
          { per_page: 1, page: 1 },
          { headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' } }
        );
        ok('Apollo API reachable (people search responded)');
      } catch (e2) {
        const s2 = e2.response?.status;
        if (s2 === 401 || s2 === 403) {
          fail('Apollo API authentication', `${s2} — check your API key`);
        } else {
          ok(`Apollo API reachable (status ${s2} — key appears valid)`);
        }
      }
    } else {
      fail('Apollo API request failed', detail);
    }
  }
}

// ── Test 2: Google Sheets ─────────────────────────────────────────────────────

async function testGoogleSheets() {
  console.log('\n[2/3] Testing Google Sheets connection...');

  let auth;
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      ok('GOOGLE_SERVICE_ACCOUNT_JSON env var is set');
      const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      ok(`Service account: ${creds.client_email}`);
      auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else if (fs.existsSync('./credentials.json')) {
      ok('credentials.json found on disk');
      auth = new google.auth.GoogleAuth({
        keyFile: './credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else {
      fail(
        'Google credentials',
        'Neither GOOGLE_SERVICE_ACCOUNT_JSON env var nor credentials.json found.\n' +
        '       See SETUP.md step 3 for instructions.'
      );
      return;
    }
  } catch (parseErr) {
    fail('Parsing Google credentials', parseErr.message);
    return;
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Read just the header row — zero writes, confirms permissions
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:I1`,
    });

    const header = (res.data.values?.[0] || []).join(', ');
    ok(`Sheet accessible: "${header}"`);

    // Count existing data rows
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B:B`,
    });
    const rowCount = Math.max(0, (dataRes.data.values?.length || 1) - 1);
    ok(`Current lead count: ${rowCount} row(s)`);

  } catch (err) {
    const detail = err.message || JSON.stringify(err);
    if (detail.includes('403') || detail.includes('PERMISSION_DENIED')) {
      fail(
        'Google Sheets permissions',
        'Service account does not have access to the sheet.\n' +
        `       Share the sheet with your service account email and grant Editor access.\n` +
        '       See SETUP.md step 3d.'
      );
    } else {
      fail('Google Sheets API error', detail);
    }
  }
}

// ── Test 3: SMTP email (optional) ────────────────────────────────────────────

async function testEmail() {
  console.log('\n[3/3] Testing email notifications (optional)...');

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || user.includes('your_gmail')) {
    console.log('  –  SMTP not configured — skipping (set SMTP_USER/SMTP_PASS to enable alerts)');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transporter.verify();
    ok(`SMTP verified — will send alerts from ${user}`);
  } catch (err) {
    fail(
      'SMTP / Gmail App Password',
      err.message +
      '\n       If using Gmail, create an App Password at: https://myaccount.google.com/apppasswords'
    );
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('────────────────────────────────────────────────────────────');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('────────────────────────────────────────────────────────────');

  await testApollo();
  await testGoogleSheets();
  await testEmail();

  console.log('\n────────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('────────────────────────────────────────────────────────────');

  if (failed === 0) {
    console.log('\n  All checks passed. You are ready to run:\n');
    console.log('    node leadgen.js --run-now   ← one immediate run');
    console.log('    node leadgen.js             ← scheduler only (7am ET daily)\n');
  } else {
    console.log('\n  Fix the failing checks above, then re-run this test.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n[Fatal]', err.message);
  process.exit(1);
});
