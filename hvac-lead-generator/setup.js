/**
 * setup.js — First-Run Connection Test
 *
 * Run this BEFORE starting the scheduler to confirm both APIs are reachable
 * and the spreadsheet is accessible.
 *
 *   npm run setup
 */
require('dotenv').config();
const path = require('path');
const ApolloClient = require('./src/apolloClient');
const SheetsManager = require('./src/sheetsManager');
const config = require('./src/config');

function loadGoogleCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  if (process.env.GOOGLE_CREDENTIALS_FILE) {
    return require(path.resolve(process.env.GOOGLE_CREDENTIALS_FILE));
  }
  return null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  HVAC Lead Generator — Connection Test');
  console.log('═══════════════════════════════════════════════════════\n');

  let apolloOk = false;
  let sheetsOk = false;

  // ── Test 1: Apollo.io ──────────────────────────────────────────────────
  process.stdout.write('1. Apollo.io  ... ');
  if (!process.env.APOLLO_API_KEY) {
    console.log('❌  APOLLO_API_KEY not set in .env');
  } else {
    try {
      const apollo = new ApolloClient(process.env.APOLLO_API_KEY);
      const data = await apollo.searchPeople({
        personTitles: ['Owner'],
        employeeRanges: ['1,10'],
        naicsCodes: config.apollo.naicsCodes,
        personLocations: config.apollo.personLocations,
        organizationLocations: config.apollo.organizationLocations,
        keywords: config.apollo.keywords,
        perPage: 1,
      });
      const total = data.pagination?.total_entries ?? (data.people?.length ?? 0);
      console.log(`✅  Connected — ${total.toLocaleString()} matching contacts found in Apollo database`);
      apolloOk = true;
    } catch (err) {
      const detail = err.response?.data?.message || err.message;
      console.log(`❌  ${detail}`);
    }
  }

  // ── Test 2: Google Sheets ──────────────────────────────────────────────
  process.stdout.write('2. Google Sheets ... ');
  const creds = loadGoogleCredentials();
  if (!creds) {
    console.log('❌  No credentials found. Set GOOGLE_CREDENTIALS_JSON or GOOGLE_CREDENTIALS_FILE in .env');
  } else {
    try {
      const sheets = new SheetsManager({
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        credentials: creds,
      });
      const title = await sheets.testConnection();
      const existingNames = await sheets.getExistingBusinessNames();
      console.log(`✅  Connected — "${title}" (${existingNames.size} existing entries)`);
      sheetsOk = true;
    } catch (err) {
      console.log(`❌  ${err.message}`);
      if (err.message.includes('The caller does not have permission')) {
        console.log(
          '\n   → Share the spreadsheet with your service account email address:\n' +
          '     (found in your credentials JSON under "client_email")\n' +
          '     Give it "Editor" access.'
        );
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────');
  if (apolloOk && sheetsOk) {
    console.log('✅  All connections verified. You are ready to go!\n');
    console.log('   Start the daily scheduler : npm start');
    console.log('   Pull leads right now       : npm run run-now');
    console.log(`\n   Spreadsheet: https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`);
  } else {
    console.log('❌  One or more connections failed. Fix the errors above, then re-run: npm run setup');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnexpected error:', err.message);
  process.exit(1);
});
