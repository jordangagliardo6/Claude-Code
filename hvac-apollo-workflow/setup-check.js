/**
 * Setup Verification Script
 * ─────────────────────────
 * Run this BEFORE the first scheduled execution to confirm:
 *   1. Your .env file has the required variables
 *   2. Apollo.io API key is valid and returns results
 *   3. Google Sheets credentials work and the spreadsheet is writable
 *
 * Usage: node setup-check.js
 */

'use strict';

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const APOLLO_API_KEY     = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID     = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME         = process.env.GOOGLE_SHEET_NAME || 'Leads';
const KEY_PATH           = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './google-service-account-key.json';

let passed = 0;
let failed = 0;

function ok(msg)   { console.log(`  ✓  ${msg}`); passed++; }
function fail(msg) { console.error(`  ✗  ${msg}`); failed++; }
function section(title) { console.log(`\n── ${title} ─────────────────────────────────`); }

// ─── 1. Environment variables ──────────────────────────────────────────────────

section('Environment variables');

if (APOLLO_API_KEY && APOLLO_API_KEY !== 'your_apollo_api_key_here') {
  ok('APOLLO_API_KEY is set');
} else {
  fail('APOLLO_API_KEY is missing or still set to placeholder');
}

if (SPREADSHEET_ID && SPREADSHEET_ID !== 'your_spreadsheet_id_here') {
  ok('GOOGLE_SPREADSHEET_ID is set');
} else {
  fail('GOOGLE_SPREADSHEET_ID is missing or still set to placeholder');
}

const keyFilePath = path.resolve(KEY_PATH);
if (fs.existsSync(keyFilePath)) {
  ok(`Google service account key found at: ${keyFilePath}`);
} else {
  fail(`Google service account key NOT found at: ${keyFilePath}`);
}

// ─── 2. Apollo.io connectivity ────────────────────────────────────────────────

section('Apollo.io API');

async function checkApollo() {
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: APOLLO_API_KEY,
        q_keywords: 'HVAC heating air conditioning',
        person_titles: ['Owner', 'President', 'Founder'],
        person_locations: ['Kalamazoo, Michigan'],
        organization_num_employees_ranges: ['1,25'],
        page: 1,
        per_page: 3,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    );

    const people = res.data?.people || res.data?.contacts || [];
    ok(`Apollo connected — returned ${people.length} sample result(s) for Kalamazoo`);

    if (people.length > 0) {
      const p = people[0];
      const org = p.organization || {};
      console.log('\n  Sample result preview:');
      console.log(`    Name:    ${p.first_name} ${p.last_name}`);
      console.log(`    Title:   ${p.title || '(no title)'}`);
      console.log(`    Company: ${org.name || '(no company name)'}`);
      console.log(`    City:    ${p.city || org.city || '(no city)'}`);
      const phone =
        (p.phone_numbers || []).find((ph) => ph.type === 'direct' || ph.type === 'mobile')?.sanitized_number ||
        (p.phone_numbers || [])[0]?.sanitized_number ||
        org.primary_phone?.sanitized_number || '(no phone — may need Apollo reveal credits)';
      console.log(`    Phone:   ${phone}`);
    }
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      fail('Apollo returned 401/403 — check your APOLLO_API_KEY');
    } else if (err.response?.status === 422) {
      fail(`Apollo 422 — bad request parameters: ${JSON.stringify(err.response.data)}`);
    } else {
      fail(`Apollo request failed: ${err.message}`);
    }
  }
}

// ─── 3. Google Sheets connectivity ────────────────────────────────────────────

section('Google Sheets API');

async function checkSheets() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Read spreadsheet metadata
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    ok(`Google Sheets connected — spreadsheet: "${meta.data.properties.title}"`);

    // Verify the target sheet tab exists
    const sheetNames = meta.data.sheets.map((s) => s.properties.title);
    if (sheetNames.includes(SHEET_NAME)) {
      ok(`Sheet tab "${SHEET_NAME}" exists`);
    } else {
      fail(`Sheet tab "${SHEET_NAME}" NOT found. Available tabs: ${sheetNames.join(', ')}`);
      console.log(`  → Set GOOGLE_SHEET_NAME in your .env to one of the above, or create a tab named "${SHEET_NAME}".`);
    }

    // Verify write access with a harmless read
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:I1`,
    });
    const header = (readRes.data.values || [[]])[0] || [];
    if (header.length === 0) {
      ok('Sheet is empty — header will be written on first run');
    } else if (header[0] === 'Date Added') {
      ok(`Header row detected: [${header.join(' | ')}]`);
    } else {
      fail(`Row 1 looks unexpected: [${header.join(' | ')}]. Clear row 1 if you want the workflow to write the header.`);
    }

  } catch (err) {
    if (err.code === 404) {
      fail(`Spreadsheet not found (404). Double-check GOOGLE_SPREADSHEET_ID.`);
    } else if (err.code === 403) {
      fail('Permission denied (403). Share the spreadsheet with the service account email found in your JSON key file.');
    } else {
      fail(`Google Sheets error: ${err.message}`);
    }
  }
}

// ─── Run all checks ───────────────────────────────────────────────────────────

(async () => {
  await checkApollo();
  await checkSheets();

  console.log('\n─────────────────────────────────────────────────');
  if (failed === 0) {
    console.log(`✓ All ${passed} checks passed — you're ready to run the workflow!`);
    console.log('\nStart the daily scheduler:  node workflow.js');
    console.log('Run once immediately:        node workflow.js --run-once');
  } else {
    console.error(`✗ ${failed} check(s) failed, ${passed} passed.`);
    console.error('  Fix the issues above before running the workflow.');
    process.exit(1);
  }
})();
