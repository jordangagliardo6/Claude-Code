/**
 * First-run connection test — verifies both Apollo.io and Google Sheets
 * are properly configured BEFORE the scheduler starts running.
 *
 * Run this once after setup:  node test-connection.js
 *
 * A clean run prints "ALL CHECKS PASSED" and shows the spreadsheet link.
 * Fix any failures before starting the scheduler with: node workflow.js
 */

require('dotenv').config();
const axios = require('axios');
const { buildSheetsClient, ensureHeaderRow, getExistingBusinessNames } = require('./sheets-client');
const { log } = require('./logger');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus';

async function checkApollo() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    throw new Error('APOLLO_API_KEY is not set in .env');
  }

  // Use the lightweight /users/api_profile endpoint to verify the key
  const response = await axios.get('https://api.apollo.io/api/v1/users/api_profile', {
    params: { api_key: apiKey },
    timeout: 15000,
  });

  if (!response.data || !response.data.user) {
    throw new Error(`Unexpected Apollo response: ${JSON.stringify(response.data).slice(0, 300)}`);
  }

  const user = response.data.user;
  return {
    email: user.email,
    name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    plan: user.organization?.plan_type || 'unknown',
  };
}

async function checkGoogleSheets() {
  const sheets = buildSheetsClient();
  await ensureHeaderRow(sheets, SPREADSHEET_ID);
  const existingNames = await getExistingBusinessNames(sheets, SPREADSHEET_ID);
  return { existingLeads: existingNames.size };
}

(async () => {
  console.log('\n════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Verification');
  console.log('════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // ── Apollo check ────────────────────────────────────────────────────────
  process.stdout.write('1. Checking Apollo.io API key... ');
  try {
    const info = await checkApollo();
    console.log(`✅  OK`);
    console.log(`   Logged in as: ${info.name} (${info.email})`);
    console.log(`   Apollo plan:  ${info.plan}`);
    if (info.plan === 'free' || info.plan === 'basic') {
      console.log('\n   ⚠️  WARNING: The "mixed_people/search" endpoint requires a paid Apollo');
      console.log('      plan. If you get API_INACCESSIBLE errors during runs, upgrade at:');
      console.log('      https://www.apollo.io/pricing\n');
    }
    passed++;
  } catch (err) {
    console.log(`❌  FAILED`);
    console.log(`   ${err.message}`);
    if (err.response?.status === 401) {
      console.log('   → Your API key is invalid. Get yours at: https://app.apollo.io/#/settings/integrations/api');
    }
    failed++;
  }

  // ── Google Sheets check ──────────────────────────────────────────────────
  process.stdout.write('\n2. Checking Google Sheets access... ');
  try {
    const info = await checkGoogleSheets();
    console.log(`✅  OK`);
    console.log(`   Spreadsheet ID: ${SPREADSHEET_ID}`);
    console.log(`   Existing leads: ${info.existingLeads}`);
    console.log(`   View: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
    passed++;
  } catch (err) {
    console.log(`❌  FAILED`);
    console.log(`   ${err.message}`);
    if (err.message.includes('not found')) {
      console.log('   → Make sure the spreadsheet is shared with your service account email.');
    } else if (err.message.includes('key file not found')) {
      console.log('   → Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_JSON in .env');
    } else if (err.code === 403) {
      console.log('   → Share the sheet with your service account email (Editor access).');
    }
    failed++;
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`  ✅  ALL CHECKS PASSED (${passed}/2)`);
    console.log('  You\'re ready to run: node workflow.js');
    console.log('  Or for an immediate one-shot run: node run-now.js');
  } else {
    console.log(`  ❌  ${failed} CHECK(S) FAILED — fix above issues before running`);
  }
  console.log('════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
})();
