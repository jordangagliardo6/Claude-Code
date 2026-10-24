/**
 * setup-test.js
 * Run this FIRST before starting the scheduler to verify:
 *   1. Apollo.io API key is valid
 *   2. Google Sheets credentials are valid
 *   3. The spreadsheet is accessible
 *   4. A single test Apollo search returns results
 *
 * Usage: node setup-test.js
 */

require('dotenv').config();
const axios = require('axios');
const { verifyConnection } = require('./sheets');
const config = require('./config');

async function main() {
  let allPassed = true;

  console.log('\n========================================');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('========================================\n');

  // 1. Check required env vars
  console.log('[1/4] Checking environment variables...');
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
  for (const key of required) {
    if (!config[key]) {
      console.error(`  FAIL: ${key} is not set in .env`);
      allPassed = false;
    } else {
      console.log(`  OK  : ${key} is set`);
    }
  }
  if (!config.GOOGLE_CREDENTIALS_JSON) {
    const fs = require('fs');
    const path = require('path');
    const credPath = path.resolve(__dirname, config.GOOGLE_CREDENTIALS_FILE);
    if (!fs.existsSync(credPath)) {
      console.error(`  FAIL: Google credentials file not found: ${credPath}`);
      allPassed = false;
    } else {
      console.log(`  OK  : Google credentials file found`);
    }
  } else {
    console.log('  OK  : GOOGLE_CREDENTIALS_JSON is set');
  }

  // 2. Verify Google Sheets connection
  console.log('\n[2/4] Testing Google Sheets connection...');
  try {
    const title = await verifyConnection();
    console.log(`  OK  : Connected to spreadsheet: "${title}"`);
  } catch (err) {
    console.error(`  FAIL: ${err.message}`);
    console.error('  Tip : Share your spreadsheet with the service account email from your JSON key file.');
    allPassed = false;
  }

  // 3. Test Apollo.io API key
  console.log('\n[3/4] Testing Apollo.io API key...');
  try {
    const res = await axios.get('https://api.apollo.io/v1/auth/health', {
      headers: { 'X-Api-Key': config.APOLLO_API_KEY },
      timeout: 10000,
    });
    if (res.data?.is_logged_in || res.status === 200) {
      console.log('  OK  : Apollo API key is valid');
    } else {
      console.error('  FAIL: Apollo returned unexpected response:', res.data);
      allPassed = false;
    }
  } catch (err) {
    // Apollo returns 401 for bad keys
    const status = err.response?.status;
    if (status === 401) {
      console.error('  FAIL: Apollo API key is invalid (401 Unauthorized)');
      console.error('  Tip : Get your key at https://app.apollo.io/#/settings/integrations/api');
    } else {
      console.error(`  FAIL: Apollo health check failed: ${err.message}`);
    }
    allPassed = false;
  }

  // 4. Run a minimal Apollo search
  console.log('\n[4/4] Running a sample Apollo search (Kalamazoo, Michigan)...');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: config.APOLLO_API_KEY,
        person_titles: config.TARGET_TITLES,
        organization_locations: ['Kalamazoo, Michigan'],
        organization_num_employees_ranges: ['1,25'],
        q_keywords: 'HVAC',
        page: 1,
        per_page: 3,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.APOLLO_API_KEY,
        },
        timeout: 30000,
      }
    );
    const count = res.data?.people?.length ?? 0;
    const total = res.data?.pagination?.total_entries ?? 'unknown';
    console.log(`  OK  : Sample search returned ${count} result(s) (${total} total available)`);
    if (count > 0) {
      const p = res.data.people[0];
      console.log(`  Sample: ${p.first_name} ${p.last_name} @ ${p.organization?.name} (${p.title})`);
    } else {
      console.warn('  Note: No results in this sample — try adjusting keywords or location.');
    }
  } catch (err) {
    console.error(`  FAIL: Sample search failed: ${err.message}`);
    if (err.response?.data) console.error('  Response:', JSON.stringify(err.response.data, null, 2));
    allPassed = false;
  }

  // Summary
  console.log('\n========================================');
  if (allPassed) {
    console.log('  All checks PASSED. You are ready to run:');
    console.log('    node scheduler.js   (keep running for daily auto-runs)');
    console.log('    node workflow.js    (run once immediately)');
  } else {
    console.log('  Some checks FAILED. Fix the issues above before running.');
  }
  console.log('========================================\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Unexpected error in setup test:', err);
  process.exit(1);
});
