'use strict';
/**
 * First-run connectivity check.
 * Run this before the first scheduled run to confirm both APIs are reachable.
 *
 *   npm run setup
 *   — or —
 *   node setup.js
 */
require('dotenv').config();

const axios  = require('axios');
const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');

const G  = '\x1b[32m'; // green
const R  = '\x1b[31m'; // red
const B  = '\x1b[1m';  // bold
const X  = '\x1b[0m';  // reset

const pass = msg => console.log(`  ${G}✓${X}  ${msg}`);
const fail = msg => console.log(`  ${R}✗${X}  ${msg}`);
const info = msg => console.log(`     ${msg}`);

// ── Apollo Check ──────────────────────────────────────────────────────────────

async function checkApollo() {
  console.log('\n1. Apollo.io');

  if (!process.env.APOLLO_API_KEY) {
    fail('APOLLO_API_KEY is not set in your .env file');
    info('Add it and re-run: APOLLO_API_KEY=your_key');
    return false;
  }

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        q_keywords: 'HVAC',
        organization_locations: ['Michigan, United States'],
        per_page: 1,
        page: 1,
      },
      { timeout: 20000, headers: { 'Content-Type': 'application/json' } }
    );

    const total = res.data?.pagination?.total_entries
               ?? res.data?.people?.length
               ?? 0;

    pass(`Connected. Found ${total} matching contacts in Michigan.`);
    if (res.data?.credits_used !== undefined) {
      info(`Credits used this call: ${res.data.credits_used}`);
    }
    return true;
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error || e.message;
    fail(`Apollo API error: ${msg}`);
    if (e.response?.status === 401) info('→ Check that your API key is correct.');
    if (e.response?.status === 422) info('→ API key found but request params are invalid.');
    return false;
  }
}

// ── Google Sheets Check ────────────────────────────────────────────────────────

async function checkGoogleSheets() {
  console.log('\n2. Google Sheets');

  if (!process.env.GOOGLE_SHEET_ID) {
    fail('GOOGLE_SHEET_ID is not set in your .env file');
    info('Paste the ID from your spreadsheet URL and re-run.');
    return false;
  }

  const credFile = path.join(__dirname, 'credentials.json');
  const hasCredFile = fs.existsSync(credFile);
  const hasEnvCreds = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );

  if (!hasCredFile && !hasEnvCreds) {
    fail('No Google credentials found.');
    info('Option A: Place credentials.json in the hvac-lead-gen/ folder');
    info('Option B: Set GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY in .env');
    return false;
  }

  try {
    let auth;
    if (hasCredFile) {
      const creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
      // Print the service account email so the user knows which account to share the sheet with
      if (creds.client_email) {
        info(`Using service account: ${creds.client_email}`);
        info('Make sure this email has Editor access to your Google Sheet.');
      }
      auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else {
      info(`Using service account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
      info('Make sure this email has Editor access to your Google Sheet.');
      auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key:  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      fields: 'properties.title,sheets.properties.title',
    });

    const sheetTitle = res.data.properties.title;
    const tabNames   = (res.data.sheets || []).map(s => s.properties.title);

    pass(`Connected. Spreadsheet: "${sheetTitle}"`);
    info(`Tabs found: ${tabNames.join(', ')}`);

    if (!tabNames.includes('Leads')) {
      info(`⚠  No "Leads" tab found — the script will write to the first sheet.`);
      info(`   Rename a tab to "Leads" for clean organization.`);
    }

    return true;
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('404') || msg.includes('not found')) {
      fail('Spreadsheet not found — double-check GOOGLE_SHEET_ID.');
    } else if (msg.includes('403') || msg.includes('permission')) {
      fail('Permission denied — share the sheet with the service account email (Editor access).');
    } else {
      fail(`Google Sheets error: ${msg}`);
    }
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${B}═══ HVAC Lead Gen — Setup Check ═══${X}`);

  const apolloOk  = await checkApollo();
  const sheetsOk  = await checkGoogleSheets();

  console.log('\n────────────────────────────────────');
  if (apolloOk && sheetsOk) {
    console.log(`${G}${B}✓ All checks passed. You're ready to go!${X}`);
    console.log('\nNext steps:');
    console.log('  Test a single run now  →  npm run run-now');
    console.log('  Start daily scheduler  →  npm start');
    console.log('  Runs daily at          →  7:00 AM Eastern Time');
    console.log('\nKeep the scheduler running in the background:');
    console.log('  pm2 start scheduler.js --name hvac-lead-gen   (recommended)');
    console.log('  nohup node scheduler.js &                      (simple background)');
  } else {
    console.log(`${R}${B}✗ Some checks failed. Fix the issues above and re-run: npm run setup${X}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error(`\nSetup check crashed: ${e.message}`);
  process.exit(1);
});
