/**
 * Connection verification script.
 * Run BEFORE the first scheduled run to confirm both Apollo and Google Sheets are reachable.
 * Run with: node test-connection.js
 */
require('dotenv').config();
const axios = require('axios');
const { config, validateConfig } = require('./src/config');
const { readAllRows, ensureHeaders } = require('./src/sheets');

async function testApollo() {
  process.stdout.write('Testing Apollo.io connection... ');
  const res = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      api_key: config.apolloApiKey,
      person_titles: ['Owner'],
      person_locations: ['Kalamazoo, Michigan'],
      q_organization_keyword_tags: ['hvac'],
      organization_num_employees_ranges: ['1,25'],
      per_page: 1,
      page: 1,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const count = res.data?.pagination?.total_entries ?? '?';
  console.log(`OK (${count} total results available in Apollo for this query)`);
  return true;
}

async function testSheets() {
  process.stdout.write('Testing Google Sheets connection... ');
  await ensureHeaders();
  const rows = await readAllRows();
  console.log(`OK (sheet has ${Math.max(0, rows.length - 1)} existing lead row(s))`);
  return true;
}

async function main() {
  console.log('=== HVAC Lead Generator — Connection Test ===\n');

  try {
    validateConfig();
  } catch (err) {
    console.error('Config error:', err.message);
    console.error('Copy .env.example to .env and fill in your keys.');
    process.exit(1);
  }

  let apolloOk = false;
  let sheetsOk = false;

  try {
    apolloOk = await testApollo();
  } catch (err) {
    console.error(`FAIL — ${err.response?.data?.error || err.message}`);
  }

  try {
    sheetsOk = await testSheets();
  } catch (err) {
    console.error(`FAIL — ${err.message}`);
    console.error('Check that the service account has edit access to the spreadsheet.');
  }

  console.log('\n--- Summary ---');
  console.log(`Apollo.io:    ${apolloOk ? '✓ Connected' : '✗ Failed'}`);
  console.log(`Google Sheets: ${sheetsOk ? '✓ Connected' : '✗ Failed'}`);

  if (apolloOk && sheetsOk) {
    console.log('\nAll systems go. Run "node scheduler.js" to start the daily job,');
    console.log('or "node run-once.js" to pull leads immediately.');
  } else {
    console.log('\nFix the failed connection(s) before starting the scheduler.');
    process.exit(1);
  }
}

main();
