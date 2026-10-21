/**
 * Connection test script — run this before the first scheduled run to confirm
 * both Apollo.io and Google Sheets are connected and working.
 *
 * Usage: node test-connection.js
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');

const PASS = '✅';
const FAIL = '❌';

async function testApollo() {
  process.stdout.write('Testing Apollo.io API connection... ');

  if (!process.env.APOLLO_API_KEY) {
    console.log(`${FAIL} APOLLO_API_KEY not set in .env`);
    return false;
  }

  try {
    // Simple search to verify the key is valid
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        q_organization_keyword_tags: ['HVAC'],
        person_locations: ['Kalamazoo, Michigan, United States'],
        per_page: 1,
        page: 1,
      },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15000,
      }
    );

    const count = res.data?.people?.length ?? 0;
    console.log(`${PASS} Connected — test query returned ${count} contact(s)`);
    return true;
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) {
      console.log(`${FAIL} Invalid API key (401 Unauthorized)`);
    } else if (status === 422) {
      console.log(`${FAIL} API key valid but query was rejected (422) — check Apollo plan`);
    } else {
      console.log(`${FAIL} ${err.message}`);
    }
    return false;
  }
}

async function testGoogleSheets() {
  process.stdout.write('Testing Google Sheets connection... ');

  const missing = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!process.env.GOOGLE_REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');
  if (!process.env.GOOGLE_SPREADSHEET_ID) missing.push('GOOGLE_SPREADSHEET_ID');

  if (missing.length > 0) {
    console.log(`${FAIL} Missing env vars: ${missing.join(', ')}`);
    return false;
  }

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const sheets = google.sheets({ version: 'v4', auth });

    // Try to read the spreadsheet metadata
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      fields: 'properties.title,sheets.properties.title',
    });

    const title = meta.data.properties.title;
    const tabNames = meta.data.sheets.map((s) => s.properties.title).join(', ');
    console.log(`${PASS} Connected — spreadsheet: "${title}" | tabs: ${tabNames}`);
    return true;
  } catch (err) {
    if (err.code === 404) {
      console.log(`${FAIL} Spreadsheet not found — check GOOGLE_SPREADSHEET_ID`);
    } else if (err.code === 403) {
      console.log(`${FAIL} Permission denied — make sure the spreadsheet is shared with your Google account`);
    } else {
      console.log(`${FAIL} ${err.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('HVAC Lead Generator — Connection Test');
  console.log('='.repeat(60) + '\n');

  const apolloOk = await testApollo();
  const sheetsOk = await testGoogleSheets();

  console.log('\n' + '='.repeat(60));
  if (apolloOk && sheetsOk) {
    console.log(`${PASS} All systems go! Run "node cron-job.js" to start the scheduler.`);
    console.log('   Or run "node index.js" to pull leads right now.');
  } else {
    console.log(`${FAIL} One or more connections failed. Fix the issues above before starting.`);
    process.exit(1);
  }
  console.log('='.repeat(60) + '\n');
}

main();
