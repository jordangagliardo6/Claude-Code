'use strict';

// First-run verification script.
// Confirms Apollo.io and Google Sheets are both connected before the scheduler starts.
// Run with: node setup.js

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');

const SHEET_HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

// ─── Apollo verification ──────────────────────────────────────────────────────
async function checkApollo() {
  console.log('\n── 1. Apollo.io Connection ──────────────────────────────');
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    console.error('  ✗ APOLLO_API_KEY is missing or still set to the placeholder in .env');
    return false;
  }

  try {
    // Minimal search to confirm the key is valid
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: apiKey,
        person_titles: ['Owner'],
        person_locations: ['Michigan, United States'],
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    );

    const total = res.data?.pagination?.total_entries ?? '?';
    const plan = res.data?.pagination ? 'active' : 'unknown';
    console.log(`  ✓ Apollo.io connected (plan: ${plan}, test search returned ${total} total matches)`);

    // Warn if phone reveal may not be available on free tier
    const samplePhone = res.data?.people?.[0]?.mobile_phone;
    if (samplePhone === undefined) {
      console.log('  ⚠ Phone numbers not visible in search results.');
      console.log('    → Apollo Basic plan ($49/mo) or higher required for reveal_phone_number.');
      console.log('    → On free plan, run enrichment separately via the Apollo UI.');
    } else {
      console.log('  ✓ Phone number reveal appears to be active on your plan.');
    }

    return true;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error || err.message;
    console.error(`  ✗ Apollo.io request failed [${status || 'ERR'}]: ${msg}`);
    if (status === 401 || status === 403) {
      console.error('    → Double-check APOLLO_API_KEY in your .env file');
    }
    return false;
  }
}

// ─── Google Sheets verification ───────────────────────────────────────────────
async function checkGoogleSheets() {
  console.log('\n── 2. Google Sheets Connection ──────────────────────────');

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './google-credentials.json';
  const sheetName = process.env.SHEET_TAB_NAME || 'Sheet1';

  if (!sheetId) {
    console.error('  ✗ GOOGLE_SHEET_ID is missing from .env');
    return false;
  }

  let sheets;
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });
  } catch (err) {
    console.error(`  ✗ Could not load Google credentials from "${credPath}": ${err.message}`);
    console.error('    → Follow the "Google Service Account Setup" section in the setup guide');
    return false;
  }

  // Confirm we can reach the spreadsheet
  let spreadsheetTitle;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    spreadsheetTitle = meta.data.properties?.title;
    console.log(`  ✓ Spreadsheet found: "${spreadsheetTitle}"`);
  } catch (err) {
    console.error(`  ✗ Could not open spreadsheet [${err.status || 'ERR'}]: ${err.message}`);
    if (err.status === 403 || err.message?.includes('403')) {
      console.error('    → Share the spreadsheet with your service account email (Editor access)');
      console.error('      Find the email in google-credentials.json under "client_email"');
    } else if (err.status === 404) {
      console.error('    → Check GOOGLE_SHEET_ID in .env — the spreadsheet may not exist');
    }
    return false;
  }

  // Check/create header row
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:I1`,
    });
    const existing = res.data.values?.[0] || [];

    if (existing.length === 0) {
      console.log(`  ⚠ Tab "${sheetName}" has no headers — creating them now...`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1:I1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [SHEET_HEADERS] },
      });
      console.log('  ✓ Headers created:', SHEET_HEADERS.join(' | '));
    } else {
      console.log('  ✓ Headers confirmed:', existing.join(' | '));
      // Check that expected columns are in the right place
      const mismatch = SHEET_HEADERS.findIndex((h, i) => existing[i]?.trim() !== h);
      if (mismatch !== -1) {
        console.log(`  ⚠ Column ${mismatch + 1} mismatch: expected "${SHEET_HEADERS[mismatch]}", found "${existing[mismatch]}"`);
        console.log('    → The workflow expects columns in this order:');
        console.log('      ' + SHEET_HEADERS.map((h, i) => `${String.fromCharCode(65 + i)}: ${h}`).join(' | '));
      }
    }
  } catch (err) {
    console.error(`  ✗ Could not read/write tab "${sheetName}": ${err.message}`);
    console.error(`    → Make sure a tab named "${sheetName}" exists in the spreadsheet`);
    return false;
  }

  return true;
}

// ─── Summary ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔═════════════════════════════════════════════════════╗');
  console.log('║     HVAC Lead Gen — First-Run Connection Check      ║');
  console.log('╚═════════════════════════════════════════════════════╝');

  const apolloOk  = await checkApollo();
  const sheetsOk  = await checkGoogleSheets();

  console.log('\n── Summary ──────────────────────────────────────────');
  console.log(`  Apollo.io:     ${apolloOk  ? '✓ Connected' : '✗ Failed'}`);
  console.log(`  Google Sheets: ${sheetsOk  ? '✓ Connected' : '✗ Failed'}`);

  if (apolloOk && sheetsOk) {
    console.log('\n✓ Everything looks good. You\'re ready to run.');
    console.log('\nNext steps:');
    console.log('  1. Test a live pull right now:');
    console.log('     node leads-workflow.js --run-once');
    console.log('\n  2. Start the daily 7am scheduler:');
    console.log('     node leads-workflow.js');
    console.log('\n  3. Keep it running with PM2:');
    console.log('     npm install -g pm2');
    console.log('     pm2 start leads-workflow.js --name hvac-leads');
    console.log('     pm2 save && pm2 startup');
  } else {
    console.log('\n✗ Fix the issues above before running the workflow.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nSetup check crashed:', err.message);
  process.exit(1);
});
