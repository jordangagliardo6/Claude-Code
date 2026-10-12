/**
 * Connection verification script — run BEFORE starting the scheduler.
 *
 * Usage: node verify.js
 *
 * Checks:
 *   1. Apollo API key is valid and plan supports People Search
 *   2. Google Sheets connection is authorized and can read the master sheet
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');

async function checkApollo() {
  console.log('\n[1/2] Testing Apollo.io connection...');
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    console.error('  ✗ APOLLO_API_KEY is not set. Add it to .env');
    return false;
  }

  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: apiKey,
        person_titles: ['Owner'],
        organization_num_employees_ranges: ['1,10'],
        q_organization_keyword_tags: ['HVAC'],
        person_locations: ['Michigan, United States'],
        per_page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const count = response.data?.pagination?.total_entries ?? 0;
    console.log(`  ✓ Apollo connected. People Search works. (~${count} total results available)`);
    return true;
  } catch (err) {
    if (err.response?.status === 422) {
      console.error('  ✗ Apollo plan limit: People Search requires a paid plan.');
      console.error('    Upgrade at: https://app.apollo.io/#/settings/plans/upgrade');
    } else if (err.response?.status === 401) {
      console.error('  ✗ Apollo: Invalid API key. Check APOLLO_API_KEY in .env');
    } else {
      console.error(`  ✗ Apollo error: ${err.message}`);
    }
    return false;
  }
}

async function checkGoogleSheets() {
  console.log('\n[2/2] Testing Google Sheets connection...');
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) { console.error('  ✗ GOOGLE_SHEET_ID not set'); return false; }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.error('  ✗ Google OAuth credentials incomplete. Run `node auth.js` first.');
    return false;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1:B1',
    });
    const header = response.data.values?.[0]?.[0] || '(empty)';
    console.log(`  ✓ Google Sheets connected. Header A1: "${header}"`);
    console.log(`  ✓ Sheet: https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    return true;
  } catch (err) {
    console.error(`  ✗ Sheets error (${err.code}): ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('=== HVAC Lead Scraper — Connection Verification ===');
  const apolloOk = await checkApollo();
  const sheetsOk = await checkGoogleSheets();

  console.log('\n=== Summary ===');
  console.log(`Apollo.io:     ${apolloOk ? '✓ Ready' : '✗ Needs attention'}`);
  console.log(`Google Sheets: ${sheetsOk ? '✓ Ready' : '✗ Needs attention'}`);

  if (apolloOk && sheetsOk) {
    console.log('\n✓ Both connections verified. Run `node index.js --run-now` to test.\n');
  } else {
    console.log('\nFix the issues above before starting the scheduler.\n');
    process.exit(1);
  }
}

main();
