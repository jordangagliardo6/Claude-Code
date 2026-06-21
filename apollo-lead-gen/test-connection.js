#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Run this before your first scheduled run (and any time you're debugging):
//   npm run test-connection
//
// Confirms Apollo.io and Google Sheets are both reachable with the
// credentials currently in .env, without writing any data or spending
// more than the minimum Apollo credits needed to prove the key works.
// ---------------------------------------------------------------------------
require('dotenv').config();
const config = require('./config');
const sheetsClient = require('./src/googleSheetsClient');

async function testApollo() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in .env');
  }
  const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.APOLLO_API_KEY,
    },
    body: JSON.stringify({ person_titles: ['Owner'], organization_locations: [config.state], per_page: 1, page: 1 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Apollo responded ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return `Apollo API key is valid. Sample query returned ${data.people ? data.people.length : 0} result(s).`;
}

async function testGoogleSheets() {
  if (!config.sheet.spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env');
  }
  const sheets = sheetsClient.getSheetsClient();
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: config.sheet.spreadsheetId });
  const tabExists = (data.sheets || []).some((s) => s.properties.title === config.sheet.tabName);
  if (!tabExists) {
    throw new Error(
      `Connected to spreadsheet "${data.properties.title}", but it has no tab named "${config.sheet.tabName}". ` +
        `Create that tab, or change GOOGLE_SHEET_TAB_NAME in .env.`
    );
  }
  await sheetsClient.ensureHeaderRow(sheets, config.sheet.spreadsheetId, config.sheet.tabName, config.sheet.columns);
  return `Connected to spreadsheet "${data.properties.title}" -> tab "${config.sheet.tabName}". Header row OK.`;
}

async function main() {
  console.log('Testing Apollo.io connection...');
  let apolloOk = true;
  try {
    console.log(`  PASS: ${await testApollo()}`);
  } catch (err) {
    apolloOk = false;
    console.log(`  FAIL: ${err.message}`);
  }

  console.log('\nTesting Google Sheets connection...');
  let sheetsOk = true;
  try {
    console.log(`  PASS: ${await testGoogleSheets()}`);
  } catch (err) {
    sheetsOk = false;
    console.log(`  FAIL: ${err.message}`);
  }

  console.log('\n' + '-'.repeat(60));
  if (apolloOk && sheetsOk) {
    console.log('Both connections succeeded. Safe to enable the 7am scheduler (npm start).');
    process.exit(0);
  } else {
    console.log('Fix the FAIL item(s) above before enabling the scheduler.');
    process.exit(1);
  }
}

main();
