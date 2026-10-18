// ─── Connection Test ──────────────────────────────────────────────────────────
// Verifies that both Apollo and Google Sheets are reachable before the first
// scheduled run. Run this FIRST after setup.
// Usage: node test-connection.js

require('dotenv').config();
const axios = require('axios');
const config = require('./config');
const { getExistingBusinessNames } = require('./src/sheetsClient');

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, err) {
  console.error(`  ✗  ${label}`);
  console.error(`     ${err.message || err}`);
  failed++;
}

(async () => {
  console.log('\n── Apollo.io connection test ────────────────────────────────');

  // Test 1: Apollo API key is set
  if (process.env.APOLLO_API_KEY && process.env.APOLLO_API_KEY !== 'your_apollo_api_key_here') {
    ok('APOLLO_API_KEY is set');
  } else {
    fail('APOLLO_API_KEY', new Error('Not set or still showing the placeholder value'));
  }

  // Test 2: Apollo API responds
  try {
    const response = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        person_titles: ['Owner'],
        organization_locations: ['Kalamazoo, Michigan'],
        q_organization_keyword_tags: ['HVAC'],
        organization_num_employees_ranges: ['1,10'],
        per_page: 1,
        page: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': process.env.APOLLO_API_KEY,
        },
        timeout: 15000,
      }
    );
    const count = response.data?.pagination?.total_entries ?? '(unknown)';
    ok(`Apollo API responded — total matching records: ${count}`);

    const hasPhones = (response.data?.people || []).some(
      (p) => p.mobile_phone || (p.phone_numbers || []).length > 0
    );
    if (hasPhones) {
      ok('Phone numbers are included in Apollo results (plan supports it)');
    } else {
      console.warn(
        '  ⚠  Phone numbers were not returned. Your Apollo plan may require\n' +
        '     an upgrade for phone access. See: https://app.apollo.io/#/settings/plans/upgrade'
      );
    }
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    fail('Apollo API request', new Error(detail));
  }

  console.log('\n── Google Sheets connection test ────────────────────────────');

  // Test 3: Google credentials file exists
  const fs = require('fs');
  const path = require('path');
  const credPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json');
  if (fs.existsSync(credPath)) {
    ok(`credentials.json found at: ${credPath}`);
  } else {
    fail('credentials.json', new Error(`File not found: ${credPath}\nSee SETUP.md for instructions.`));
  }

  // Test 4: Can read from the spreadsheet
  try {
    const names = await getExistingBusinessNames(config);
    ok(`Google Sheets read OK — ${names.size} existing business(es) in sheet`);
  } catch (err) {
    fail('Google Sheets read', err);
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('All connections verified. You are ready to run the scheduler.\n');
    console.log('  Start the scheduler:  node index.js');
    console.log('  Run once right now:   node run-now.js\n');
  } else {
    console.log('\nFix the issues above before starting the scheduler.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
})();
