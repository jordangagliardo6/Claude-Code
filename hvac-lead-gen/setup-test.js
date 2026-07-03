/**
 * setup-test.js
 * Run this FIRST to verify both Apollo.io and Google Sheets are connected
 * before the scheduler takes over.
 *
 * Usage:  node setup-test.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP INSTRUCTIONS (read before running)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * STEP 1 — Install dependencies
 *   cd hvac-lead-gen
 *   npm install
 *
 * STEP 2 — Copy environment file
 *   cp .env.example .env
 *   (then edit .env with your values)
 *
 * STEP 3 — Apollo.io API Key
 *   a. Go to https://developer.apollo.io
 *   b. Sign in → API Keys → Create new API key
 *   c. Paste the key into .env as APOLLO_API_KEY
 *   Note: Free tier = 50 enrichments/month. Basic plan ($49/mo) = 1,000/month.
 *         Running 25 leads/day × 30 days = 750 leads/month → Basic plan recommended.
 *
 * STEP 4 — Google Cloud Project & Service Account
 *   a. Go to https://console.cloud.google.com
 *   b. Create a new project (or use an existing one)
 *   c. Enable the Google Sheets API:
 *      APIs & Services → Enable APIs → search "Google Sheets API" → Enable
 *   d. Create a Service Account:
 *      IAM & Admin → Service Accounts → Create Service Account
 *      - Name it anything (e.g. "hvac-lead-gen")
 *      - No special roles needed at the project level
 *   e. Generate a JSON key:
 *      Click the service account → Keys tab → Add Key → Create new key → JSON
 *      Download the file and save it as:  hvac-lead-gen/service-account.json
 *   f. Set the path in .env:
 *      GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account.json
 *
 * STEP 5 — Create your Google Sheet and share it
 *   a. Go to https://sheets.google.com and create a new spreadsheet
 *   b. Name it something like "SW Michigan HVAC Leads"
 *   c. Copy the Sheet ID from the URL:
 *      https://docs.google.com/spreadsheets/d/  ← THIS PART →  /edit
 *   d. Paste the ID into .env as GOOGLE_SPREADSHEET_ID
 *   e. Share the sheet with your service account email:
 *      - Open your service-account.json → copy the "client_email" value
 *      - In Google Sheets: Share → paste the service account email → Editor → Send
 *      (The sheet does NOT need to be public — just shared with the service account)
 *
 * STEP 6 — (Optional) Email alerts
 *   a. Set NOTIFY_EMAIL=true in .env
 *   b. Create a Gmail App Password:
 *      https://myaccount.google.com/apppasswords
 *      (Requires 2FA to be enabled on your Google account)
 *   c. Set SMTP_USER, SMTP_PASS, and ALERT_EMAIL in .env
 *
 * STEP 7 — Run this script to test everything
 *   node setup-test.js
 *
 * STEP 8 — Start the scheduler
 *   node index.js
 *   (Keep it running 24/7 with PM2: npm install -g pm2 && pm2 start index.js)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

require('dotenv').config();

const axios    = require('axios');
const { google } = require('googleapis');
const fs       = require('fs');
const path     = require('path');

const PASS = '✓';
const FAIL = '✗';

(async () => {
  console.log('');
  console.log('══════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('══════════════════════════════════════════════════');
  console.log('');

  let allPassed = true;

  // ── Test 1: Apollo.io API Key ───────────────────────────────────────────────
  console.log('1. Testing Apollo.io API key…');
  try {
    if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set in .env');

    const res = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        api_key  : process.env.APOLLO_API_KEY,
        per_page : 1,
        page     : 1,
        // Minimal search just to confirm the key works
        organization_locations: ['Michigan, United States'],
        person_titles: ['Owner'],
      },
      {
        headers : { 'Content-Type': 'application/json' },
        timeout : 15_000,
      }
    );

    const count = res.data?.pagination?.total_entries ?? 0;
    console.log(`   ${PASS}  Apollo key is valid — database accessible (${count.toLocaleString()} total records for this query)`);
  } catch (err) {
    allPassed = false;
    const detail = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    console.log(`   ${FAIL}  Apollo API test failed: ${detail}`);
    console.log('       → Check APOLLO_API_KEY in your .env file');
  }

  console.log('');

  // ── Test 2: Service Account File ───────────────────────────────────────────
  console.log('2. Testing Google service account key file…');
  let credentials = null;
  try {
    const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './service-account.json';
    const resolved = path.resolve(keyFile);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    credentials = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('JSON file is missing client_email or private_key — make sure you downloaded a JSON key (not P12)');
    }
    console.log(`   ${PASS}  Service account file found`);
    console.log(`   ${PASS}  Service account email: ${credentials.client_email}`);
    console.log(`         (This email must be added as an Editor on your Google Sheet)`);
  } catch (err) {
    allPassed = false;
    console.log(`   ${FAIL}  Service account file error: ${err.message}`);
    console.log('       → Follow STEP 4 in the setup instructions above');
  }

  console.log('');

  // ── Test 3: Google Sheets connection ───────────────────────────────────────
  console.log('3. Testing Google Sheets connection…');
  try {
    if (!credentials) throw new Error('Skipped — fix service account file first (test 2)');
    if (!process.env.GOOGLE_SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID not set in .env');

    const auth   = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    const tab    = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

    const meta = await sheets.spreadsheets.get({
      spreadsheetId : process.env.GOOGLE_SPREADSHEET_ID,
      fields        : 'properties.title,sheets.properties.title',
    });

    const title = meta.data.properties?.title ?? '(untitled)';
    const tabs  = (meta.data.sheets ?? []).map(s => s.properties?.title);

    console.log(`   ${PASS}  Google Sheets connected`);
    console.log(`   ${PASS}  Spreadsheet: "${title}"`);
    console.log(`   ${PASS}  Available tabs: ${tabs.join(', ')}`);

    if (!tabs.includes(tab)) {
      console.log(`   ⚠   Tab "${tab}" not found — the script will use the first tab, or update GOOGLE_SHEET_TAB in .env`);
    } else {
      console.log(`   ${PASS}  Target tab "${tab}" exists`);
    }
  } catch (err) {
    allPassed = false;
    const detail = err.response?.data?.error?.message || err.message;
    console.log(`   ${FAIL}  Google Sheets test failed: ${detail}`);
    if (detail.includes('not found') || detail.includes('404')) {
      console.log('       → Double-check GOOGLE_SPREADSHEET_ID in .env');
    } else if (detail.includes('403') || detail.includes('permission')) {
      console.log(`       → Share your Google Sheet with: ${credentials?.client_email ?? 'your service account email'}`);
      console.log('         Open the sheet → Share → paste email → set to Editor → Send');
    }
  }

  console.log('');

  // ── Test 4: Email (optional) ───────────────────────────────────────────────
  if (process.env.NOTIFY_EMAIL === 'true') {
    console.log('4. Testing email notification (NOTIFY_EMAIL=true)…');
    try {
      const nodemailer = require('nodemailer');
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP_USER or SMTP_PASS not set in .env');
      }
      const transporter = nodemailer.createTransport({
        service : 'gmail',
        auth    : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.verify();
      console.log(`   ${PASS}  Gmail SMTP credentials valid`);
    } catch (err) {
      allPassed = false;
      console.log(`   ${FAIL}  Gmail SMTP failed: ${err.message}`);
      console.log('       → Create an App Password at: https://myaccount.google.com/apppasswords');
    }
    console.log('');
  }

  // ── Final result ───────────────────────────────────────────────────────────
  if (allPassed) {
    console.log('══════════════════════════════════════════════════');
    console.log('  All tests passed! You are ready to go.');
    console.log('');
    console.log('  Run one batch right now:   node run-now.js');
    console.log('  Start the daily scheduler: node index.js');
    console.log('══════════════════════════════════════════════════');
  } else {
    console.log('══════════════════════════════════════════════════');
    console.log('  One or more tests failed. Fix the issues above,');
    console.log('  then re-run:  node setup-test.js');
    console.log('══════════════════════════════════════════════════');
    process.exit(1);
  }

  console.log('');
})();
