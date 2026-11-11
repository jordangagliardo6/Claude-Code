/**
 * setup.js — First-time setup verification.
 *
 * Run this before starting the scheduler:
 *   npm run setup
 *
 * This script:
 *  1. Checks all required environment variables
 *  2. Tests the Apollo.io API connection
 *  3. Tests the Google Sheets connection
 *  4. Prints a detailed walkthrough for anything missing
 */
require('dotenv').config();
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const config = require('./src/config');
const { ensureSpreadsheet, verifySheetAccess, writeHeaders } = require('./src/sheets');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const INFO = '\x1b[33m→\x1b[0m';

async function runSetup() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       HVAC Lead Gen — First-Time Setup Check     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let allPassed = true;

  // ── 1. Environment variables ──────────────────────────────────────
  console.log('1. Environment Variables\n');

  const apolloKey = config.apollo.apiKey;
  if (apolloKey) {
    console.log(`   ${PASS} APOLLO_API_KEY is set (${apolloKey.slice(0, 6)}...)`);
  } else {
    console.log(`   ${FAIL} APOLLO_API_KEY is missing`);
    console.log(`   ${INFO} Get your key at: https://developer.apollo.io → API Keys`);
    console.log(`   ${INFO} Then add it to your .env file: APOLLO_API_KEY=your_key_here\n`);
    allPassed = false;
  }

  const credPath = path.resolve(config.google.credentialsPath);
  if (fs.existsSync(credPath)) {
    console.log(`   ${PASS} Google credentials file found: ${credPath}`);
  } else {
    console.log(`   ${FAIL} Google credentials file NOT found at: ${credPath}`);
    printGoogleSetupInstructions();
    allPassed = false;
  }

  if (config.notifications.email) {
    console.log(`   ${PASS} NOTIFICATION_EMAIL set: ${config.notifications.email}`);
  } else {
    console.log(`   ${INFO} NOTIFICATION_EMAIL not set — errors will log to console only`);
  }

  console.log('');

  // ── 2. Apollo.io API test ─────────────────────────────────────────
  console.log('2. Apollo.io API Connection\n');

  if (!apolloKey) {
    console.log(`   ${FAIL} Skipped — APOLLO_API_KEY not set\n`);
  } else {
    try {
      const res = await axios.post(
        `${config.apollo.baseUrl}/mixed_people/search`,
        {
          api_key: apolloKey,
          per_page: 1,
          page: 1,
          person_titles: ['Owner'],
          organization_locations: ['Michigan, United States'],
        },
        {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          timeout: 15000,
        }
      );
      const count = res.data?.pagination?.total_entries ?? '?';
      console.log(`   ${PASS} Apollo API connected. Total matching contacts in MI: ${count}`);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      if (status === 401 || status === 403) {
        console.log(`   ${FAIL} Apollo API authentication failed — check your API key`);
      } else if (status === 429) {
        console.log(`   ${FAIL} Apollo API rate limit hit — try again later`);
      } else {
        console.log(`   ${FAIL} Apollo API test failed: ${msg}`);
      }
      allPassed = false;
    }
    console.log('');
  }

  // ── 3. Google Sheets test ─────────────────────────────────────────
  console.log('3. Google Sheets Connection\n');

  if (!fs.existsSync(credPath)) {
    console.log(`   ${FAIL} Skipped — credentials file not found\n`);
  } else {
    try {
      const sheetId = await ensureSpreadsheet();
      const info = await verifySheetAccess(sheetId);
      console.log(`   ${PASS} Google Sheets connected`);
      console.log(`   ${PASS} Spreadsheet: "${info.title}"`);
      console.log(`   ${PASS} Tab found/created: "${config.sheets.tabName}"`);
      console.log(`   ${INFO} Sheet URL: https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
      if (!process.env.GOOGLE_SHEET_ID) {
        console.log(`\n   ${INFO} Add this to your .env to reuse this sheet:`);
        console.log(`       GOOGLE_SHEET_ID=${sheetId}`);
      }
    } catch (err) {
      console.log(`   ${FAIL} Google Sheets test failed: ${err.message}`);
      if (err.message.includes('credentials file not found')) {
        printGoogleSetupInstructions();
      } else {
        console.log(`\n   ${INFO} Common fixes:`);
        console.log('      - Share the spreadsheet with your service account email');
        console.log('      - Enable Google Sheets API and Google Drive API in Google Cloud Console');
        console.log('      - Check that your service account JSON file is valid');
      }
      allPassed = false;
    }
    console.log('');
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log('═'.repeat(52));
  if (allPassed) {
    console.log(`\n${PASS} All checks passed! You are ready to run:\n`);
    console.log('   node index.js          ← run once now');
    console.log('   node scheduler.js      ← start 7am daily schedule\n');
  } else {
    console.log(`\n${FAIL} Some checks failed. Fix the issues above, then re-run:\n`);
    console.log('   npm run setup\n');
    process.exit(1);
  }
}

function printGoogleSetupInstructions() {
  console.log(`
   ${INFO} How to create a Google Service Account:

   Step 1: Go to https://console.cloud.google.com
   Step 2: Create a new project (or select existing)
   Step 3: Enable these two APIs:
           - Google Sheets API
           - Google Drive API
           (APIs & Services → Library → search each one → Enable)
   Step 4: Create a Service Account:
           IAM & Admin → Service Accounts → Create Service Account
           Name it anything (e.g., "hvac-lead-gen")
           Skip optional role and user access steps
   Step 5: Create a JSON key:
           Click your new service account → Keys tab → Add Key → Create new key → JSON
           Download the JSON file
   Step 6: Save the JSON file to:
           ${path.resolve(config.google.credentialsPath)}
   Step 7: Share your Google Sheet with the service account email
           (found inside the JSON file as "client_email")
           Give it "Editor" access
   Step 8: Re-run: npm run setup
`);
}

runSetup().catch((err) => {
  console.error('\n[Setup] Fatal error:', err.message);
  process.exit(1);
});
