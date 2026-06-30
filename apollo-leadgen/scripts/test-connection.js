/**
 * First-run sanity check. Confirms the Apollo API key works and the Google
 * Sheets OAuth credentials can read your spreadsheet — run this BEFORE
 * turning on the scheduler.
 *
 * Usage: npm run test-connection
 */

require('dotenv').config();
const config = require('../config');
const apollo = require('../src/apolloClient');
const sheetsClient = require('../src/googleSheetsClient');

async function testApollo() {
  process.stdout.write('Testing Apollo.io connection... ');
  const people = await apollo.searchPeople({
    city: config.cities[0],
    state: config.state,
    titles: config.titlesByPriority,
    industryKeywords: config.industryKeywords,
    employeeRanges: config.employeeRanges,
    perPage: 1,
  });
  console.log(`OK (test query returned ${people.length} result(s))`);
}

async function testGoogleSheets() {
  process.stdout.write('Testing Google Sheets connection... ');
  const sheets = sheetsClient.getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
  const tabNames = meta.data.sheets.map((s) => s.properties.title);
  if (!tabNames.includes(config.sheet.tabName)) {
    throw new Error(
      `Connected, but no tab named "${config.sheet.tabName}" was found. Found tabs: ${tabNames.join(', ')}`
    );
  }
  console.log(`OK (found spreadsheet "${meta.data.properties.title}", tab "${config.sheet.tabName}")`);
}

async function main() {
  let ok = true;

  try {
    await testApollo();
  } catch (err) {
    ok = false;
    console.log('FAILED');
    console.error('  ->', err.message);
  }

  try {
    await testGoogleSheets();
  } catch (err) {
    ok = false;
    console.log('FAILED');
    console.error('  ->', err.message);
  }

  if (ok) {
    console.log('\nBoth connections succeeded. You are ready to run `npm run run-once` or `npm start`.');
    process.exit(0);
  } else {
    console.log('\nFix the error(s) above before enabling the scheduler.');
    process.exit(1);
  }
}

main();
