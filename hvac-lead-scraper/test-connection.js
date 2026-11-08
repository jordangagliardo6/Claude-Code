/**
 * Connection test — run this before the first scheduled execution.
 *
 *   npm run test-connection
 *
 * Verifies:
 *   1. Apollo.io API key is valid and can search SW Michigan HVAC leads
 *   2. Google Sheets credentials are valid and the target sheet is accessible
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function testApollo() {
  console.log('\n── Apollo.io ──────────────────────────────────────');
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error('  ✗  APOLLO_API_KEY is not set in .env');
    return false;
  }

  const res = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      api_key: apiKey,
      q_organization_keyword_tags: ['hvac', 'heating and air conditioning'],
      person_titles: ['Owner', 'President'],
      person_locations: ['Kalamazoo, Michigan, United States'],
      organization_num_employees_ranges: ['1,25'],
      per_page: 1,
      page: 1,
    },
    {
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      timeout: 15000,
    }
  );

  const total = res.data?.pagination?.total_entries ?? 0;
  const hasPhoneReveal = res.data?.people?.[0]?.phone_numbers?.length > 0;

  console.log(`  ✓  Connected. Total matching contacts across all pages: ${total}`);

  if (!hasPhoneReveal && total > 0) {
    console.warn('  ⚠  Phone numbers were not returned — your Apollo plan may not');
    console.warn('     include phone reveal. Upgrade to Basic ($49/mo) or higher.');
    console.warn('     Leads without phone numbers will be automatically skipped.');
  }

  return true;
}

async function testGoogleSheets() {
  console.log('\n── Google Sheets ──────────────────────────────────');
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    console.error('  ✗  GOOGLE_SHEET_ID is not set in .env');
    return false;
  }

  const credPath =
    process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, 'credentials', 'service-account.json');

  if (!fs.existsSync(credPath)) {
    console.error(`  ✗  Credentials file not found at: ${credPath}`);
    console.error('     Download a service account key from Google Cloud Console');
    console.error('     and save it at that path (or set GOOGLE_CREDENTIALS_PATH in .env).');
    return false;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });

  console.log(`  ✓  Connected. Sheet title: "${res.data.properties.title}"`);

  const sheetNames = res.data.sheets.map((s) => s.properties.title);
  const targetSheet = process.env.SHEET_NAME || 'Leads';

  if (sheetNames.includes(targetSheet)) {
    console.log(`  ✓  Tab "${targetSheet}" exists.`);
  } else {
    console.warn(`  ⚠  Tab "${targetSheet}" not found. Available tabs: ${sheetNames.join(', ')}`);
    console.warn(`     Create a tab named "${targetSheet}" or set SHEET_NAME in .env.`);
  }

  return true;
}

async function main() {
  console.log('='.repeat(52));
  console.log('  HVAC Lead Scraper — Connection Test');
  console.log('='.repeat(52));

  let apolloOk = false;
  let sheetsOk = false;

  try {
    apolloOk = await testApollo();
  } catch (err) {
    console.error(`  ✗  Apollo.io FAILED: ${err.message}`);
    if (err.response?.data) console.error('     API response:', JSON.stringify(err.response.data));
  }

  try {
    sheetsOk = await testGoogleSheets();
  } catch (err) {
    console.error(`  ✗  Google Sheets FAILED: ${err.message}`);
  }

  console.log('\n' + '='.repeat(52));
  console.log(`  Apollo.io:     ${apolloOk ? '✓ Connected' : '✗ Failed'}`);
  console.log(`  Google Sheets: ${sheetsOk ? '✓ Connected' : '✗ Failed'}`);
  console.log('='.repeat(52));

  if (apolloOk && sheetsOk) {
    console.log('\nAll connections verified!\n');
    console.log('  npm run run-now   — run a scrape right now');
    console.log('  npm start         — start the daily 7am scheduler\n');
    process.exit(0);
  } else {
    console.log('\nFix the failed connections above, then run this test again.\n');
    process.exit(1);
  }
}

main();
