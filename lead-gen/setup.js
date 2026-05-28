/**
 * setup.js — First-run connection verification script.
 *
 * Run this BEFORE starting the scheduler to confirm both APIs are reachable
 * and credentials are valid. It will NOT write any data or consume credits.
 *
 * Usage:  npm run setup
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');

const PASS = '✓';
const FAIL = '✗';

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(' HVAC Lead Gen — Setup & Connection Check');
  console.log('═'.repeat(60) + '\n');

  let allOk = true;

  // ── 1. Check .env variables ───────────────────────────────────────────────
  console.log('Step 1: Checking environment variables…');
  const requiredVars = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
  const credVar = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? 'GOOGLE_SERVICE_ACCOUNT_JSON'
    : process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
    ? 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE'
    : null;

  for (const v of requiredVars) {
    if (process.env[v]) {
      console.log(`  ${PASS} ${v} is set`);
    } else {
      console.log(`  ${FAIL} ${v} is MISSING — add it to your .env file`);
      allOk = false;
    }
  }

  if (credVar) {
    console.log(`  ${PASS} Google credentials found via ${credVar}`);
  } else {
    console.log(`  ${FAIL} No Google credentials — set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE`);
    allOk = false;
  }

  // ── 2. Test Apollo API ────────────────────────────────────────────────────
  console.log('\nStep 2: Testing Apollo.io API connection…');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { per_page: 1, q_keywords: 'HVAC Michigan' },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY,
        },
        timeout: 15000,
      }
    );

    const count = res.data?.pagination?.total_entries;
    console.log(`  ${PASS} Apollo API connected successfully`);
    console.log(`  ${PASS} Test query found ${count ?? 'unknown'} total records for "HVAC Michigan"`);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) {
      console.log(`  ${FAIL} Apollo API key rejected (HTTP 401) — check APOLLO_API_KEY`);
    } else if (status === 429) {
      console.log(`  ${FAIL} Apollo rate limit hit — your API key is valid but you've hit a limit`);
    } else {
      console.log(`  ${FAIL} Apollo API error: ${err.message}`);
    }
    allOk = false;
  }

  // ── 3. Test Google Sheets API ─────────────────────────────────────────────
  console.log('\nStep 3: Testing Google Sheets API connection…');
  try {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } else {
      credentials = require(path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE));
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      fields: 'spreadsheetId,properties.title',
    });

    const title = meta.data.properties.title;
    console.log(`  ${PASS} Google Sheets API connected successfully`);
    console.log(`  ${PASS} Spreadsheet found: "${title}"`);
    console.log(`  ${PASS} Sheet ID: ${process.env.GOOGLE_SHEET_ID}`);

    await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A1:A2',
    });
    console.log(`  ${PASS} Read permission confirmed`);
  } catch (err) {
    if (err.code === 403) {
      console.log(`  ${FAIL} Permission denied (HTTP 403)`);
      console.log(`       → Share the spreadsheet with your service account's client_email`);
      console.log(`       → Give it "Editor" access`);
    } else if (err.code === 404) {
      console.log(`  ${FAIL} Spreadsheet not found (HTTP 404) — check GOOGLE_SHEET_ID`);
    } else if (err.message?.includes('parse')) {
      console.log(`  ${FAIL} Could not parse credentials JSON: ${err.message}`);
    } else {
      console.log(`  ${FAIL} Google Sheets error: ${err.message}`);
    }
    allOk = false;
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  if (allOk) {
    console.log(`${PASS} ALL CHECKS PASSED — you're ready to run!\n`);
    console.log('  Start the scheduler:  node index.js');
    console.log('  Run once right now:   npm run run-now\n');
  } else {
    console.log(`${FAIL} SOME CHECKS FAILED — fix the issues above, then re-run: npm run setup\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nUnexpected error during setup:', err.message);
  process.exit(1);
});
