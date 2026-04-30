/**
 * testConnection.js
 * Run this before your first scheduled run to confirm both
 * Apollo.io and Google Sheets are reachable with your credentials.
 *
 * Usage:  npm run test-connection
 *
 * What it checks:
 *   - APOLLO_API_KEY is set and returns a valid response from Apollo
 *   - Google service-account credentials.json is present and valid
 *   - The target spreadsheet is accessible (prints its title)
 */

'use strict';

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');

// ─────────────────────────────────────────────────────────────────────────────

async function testApollo() {
  console.log('\n─── Apollo.io ───────────────────────────────────────');

  if (!process.env.APOLLO_API_KEY) {
    console.error('  FAIL  APOLLO_API_KEY is not set in .env');
    return false;
  }

  try {
    // Fire a minimal people search — just 1 result to confirm auth works
    const { data } = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        per_page: 1,
        page: 1,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15_000,
      }
    );

    if (data && 'people' in data) {
      const pagination = data.pagination ?? {};
      console.log('  OK    Apollo.io API key accepted.');
      console.log(`        Total people in Apollo index: ${pagination.total_entries ?? 'unknown'}`);
      return true;
    }

    console.error('  FAIL  Unexpected response shape from Apollo:', JSON.stringify(data));
    return false;
  } catch (err) {
    const detail =
      err.response?.data?.message ??
      err.response?.data?.error ??
      err.message;
    console.error(`  FAIL  ${detail}`);
    if (err.response?.status === 401) {
      console.error('        Your API key may be invalid. Check APOLLO_API_KEY in .env.');
    }
    return false;
  }
}

async function testGoogleSheets() {
  console.log('\n─── Google Sheets ───────────────────────────────────');

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const keyFile = process.env.GOOGLE_CREDENTIALS_PATH ?? 'credentials.json';

  if (!spreadsheetId) {
    console.error('  FAIL  GOOGLE_SPREADSHEET_ID is not set in .env');
    return false;
  }

  // Check credentials file exists
  const fs = require('fs');
  if (!fs.existsSync(keyFile)) {
    console.error(`  FAIL  Credentials file not found: ${keyFile}`);
    console.error('        See credentials.example.json for the expected format.');
    console.error('        Steps: Google Cloud Console → IAM → Service Accounts → Keys → Add Key → JSON');
    return false;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const { data } = await sheets.spreadsheets.get({ spreadsheetId });
    console.log('  OK    Google Sheets API credentials accepted.');
    console.log(`        Spreadsheet : "${data.properties.title}"`);

    // Check the target tab exists
    const sheetName = process.env.GOOGLE_SHEET_NAME ?? 'Leads';
    const tab = data.sheets?.find(
      (s) => s.properties?.title === sheetName
    );
    if (tab) {
      console.log(`        Tab "${sheetName}" found.`);
    } else {
      console.warn(`  WARN  Tab "${sheetName}" not found.`);
      console.warn(
        `        Available tabs: ${data.sheets?.map((s) => s.properties?.title).join(', ')}`
      );
      console.warn(
        `        Either create a tab named "${sheetName}" or update GOOGLE_SHEET_NAME in .env.`
      );
    }

    // Verify write access with a no-op (get sheet metadata, not a write)
    const serviceAccountEmail = JSON.parse(
      fs.readFileSync(keyFile, 'utf8')
    ).client_email;
    console.log(`        Service account: ${serviceAccountEmail}`);
    console.log(`        Make sure this email has Editor access to your spreadsheet.`);

    return true;
  } catch (err) {
    console.error(`  FAIL  ${err.message}`);
    if (err.message.includes('not found') || err.message.includes('404')) {
      console.error(
        '        Spreadsheet not found. Check GOOGLE_SPREADSHEET_ID in .env.'
      );
    } else if (err.message.includes('403')) {
      console.error(
        '        Permission denied. Share the spreadsheet with the service account email (Editor role).'
      );
    }
    return false;
  }
}

async function main() {
  console.log('\nRunning connection tests...');
  console.log('(This does NOT write anything to your spreadsheet.)\n');

  const apolloOk = await testApollo();
  const sheetsOk = await testGoogleSheets();

  console.log('\n─── Summary ─────────────────────────────────────────');
  console.log(`  Apollo.io     : ${apolloOk ? 'CONNECTED' : 'FAILED'}`);
  console.log(`  Google Sheets : ${sheetsOk ? 'CONNECTED' : 'FAILED'}`);
  console.log('─────────────────────────────────────────────────────\n');

  if (apolloOk && sheetsOk) {
    console.log('All connections OK.');
    console.log('\nNext steps:');
    console.log('  • Run a single test pull:  npm run run-now');
    console.log('  • Start the daily scheduler: npm start\n');
    process.exit(0);
  } else {
    console.log('One or more connections failed. Fix the issues above and re-run:\n');
    console.log('  npm run test-connection\n');
    process.exit(1);
  }
}

main();
