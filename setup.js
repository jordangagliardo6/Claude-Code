'use strict';

/**
 * First-run verification script.
 * Run this BEFORE the first scheduled run to confirm both APIs are working.
 *
 *   node setup.js
 */

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const PASS = '✅';
const FAIL = '❌';
const INFO = 'ℹ️ ';

let allPassed = true;

function check(label, passed, detail = '') {
  const icon = passed ? PASS : FAIL;
  console.log(`  ${icon}  ${label}${detail ? `  —  ${detail}` : ''}`);
  if (!passed) allPassed = false;
}

async function verifyEnvVars() {
  console.log('\n── Environment Variables ──────────────────────────────────────');

  const required = {
    APOLLO_API_KEY: process.env.APOLLO_API_KEY,
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
    GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  };

  for (const [key, val] of Object.entries(required)) {
    check(key, Boolean(val), val ? '(set)' : 'MISSING — check .env');
  }

  const optional = {
    NOTIFY_EMAIL_TO: process.env.NOTIFY_EMAIL_TO,
    GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
  };

  for (const [key, val] of Object.entries(optional)) {
    console.log(`  ${INFO} ${key}: ${val ? '(set)' : 'not set — email alerts disabled'}`);
  }
}

async function verifyApollo() {
  console.log('\n── Apollo.io Connection ───────────────────────────────────────');

  if (!process.env.APOLLO_API_KEY) {
    check('Apollo API key', false, 'Set APOLLO_API_KEY in .env first');
    return;
  }

  try {
    // Lightweight call: fetch a single result to verify the key works
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        person_titles: ['owner'],
        organization_num_employees_ranges: ['1,25'],
        person_locations: ['Michigan, United States'],
        q_organization_keyword_tags: ['hvac'],
        per_page: 1,
        page: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': process.env.APOLLO_API_KEY,
        },
        timeout: 15000,
      }
    );

    const count = res.data?.pagination?.total_entries ?? 0;
    const people = res.data?.people?.length ?? 0;
    check('Apollo API key is valid', true);
    check(
      'Apollo search returned results',
      people > 0,
      `${count} total matches in Apollo for your filters`
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    check('Apollo API connection', false, `HTTP ${status ?? 'network error'}: ${detail}`);
  }
}

async function verifyGoogleSheets() {
  console.log('\n── Google Sheets Connection ───────────────────────────────────');

  const keyPath = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './credentials/service-account.json'
  );

  if (!fs.existsSync(keyPath)) {
    check('Service account key file', false, `Not found at: ${keyPath}`);
    console.log(`\n     See credentials/README.md for setup instructions.`);
    return;
  }

  check('Service account key file found', true, keyPath);

  if (!process.env.GOOGLE_SHEET_ID) {
    check('GOOGLE_SHEET_ID', false, 'Set it in .env');
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const sheetTab = process.env.GOOGLE_SHEET_TAB || 'HVAC Leads';

    // Try reading the first row — confirms auth + sheet access
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `'${sheetTab}'!A1:I1`,
    });

    check('Google Sheets auth', true, 'Service account authenticated');
    check('Spreadsheet accessible', true, `Sheet tab "${sheetTab}" reachable`);

    const headers = res.data.values?.[0] ?? [];
    if (headers.length === 0) {
      console.log(`  ${INFO} Sheet is empty — headers will be created on the first run.`);
    } else {
      console.log(`  ${INFO} Current headers: ${headers.join(' | ')}`);
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
      check('Spreadsheet access', false, 'Share your sheet with the service account email (see credentials/README.md)');
    } else if (msg.includes('not found') || msg.includes('404')) {
      check('Spreadsheet ID', false, 'Sheet not found — check GOOGLE_SHEET_ID in .env');
    } else {
      check('Google Sheets connection', false, msg);
    }
  }
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Scraper — First-Run Setup Verification');
  console.log('══════════════════════════════════════════════════════════');

  await verifyEnvVars();
  await verifyApollo();
  await verifyGoogleSheets();

  console.log('\n══════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  ✅  All checks passed! You\'re ready to run.');
    console.log('\n  To run immediately:    node lead-scraper.js --run-now');
    console.log('  To start the scheduler: node lead-scraper.js');
  } else {
    console.log('  ❌  Some checks failed. Fix the issues above before running.');
  }
  console.log('══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\nSetup check failed unexpectedly:', err.message);
  process.exit(1);
});
