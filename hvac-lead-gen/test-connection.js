/**
 * First-run connection test.
 *
 * Run this BEFORE starting the scheduler to confirm that:
 *   1. Your Apollo API key is valid and readable
 *   2. The Google Sheets service account can access the spreadsheet
 *
 * Usage:
 *   npm run test-connection
 *   # or
 *   node test-connection.js
 */

require('dotenv').config();

const axios = require('axios');
const { verifyConnection } = require('./src/sheets');

async function testApollo() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY not set');

  // Profile endpoint is available on all plans including free
  const res = await axios.post(
    'https://api.apollo.io/api/v1/users/me',
    { api_key: key },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  const user = res.data?.user || res.data;
  return {
    email: user?.email,
    plan: user?.plan_type || 'unknown',
    creditsRemaining: user?.num_credits_remaining ?? 'n/a',
    directDialCredits: user?.effective_num_direct_dial_credits ?? 'n/a',
  };
}

async function main() {
  console.log('──────────────────────────────────────────');
  console.log(' HVAC Lead Generator — Connection Test');
  console.log('──────────────────────────────────────────\n');

  // ── Apollo ──────────────────────────────────────────────────────────────────
  process.stdout.write('1. Apollo.io API key ... ');
  try {
    const info = await testApollo();
    console.log('✅ Connected');
    console.log(`   Account: ${info.email}`);
    console.log(`   Plan: ${info.plan}`);
    console.log(`   Lead credits remaining: ${info.creditsRemaining}`);
    console.log(`   Direct dial credits: ${info.directDialCredits}`);
    if (info.plan === 'free') {
      console.log('\n   ⚠️  Free plan detected.');
      console.log('   People search + phone enrichment require a paid Apollo plan.');
      console.log('   Upgrade at https://www.apollo.io/pricing to use the full workflow.\n');
    }
  } catch (err) {
    console.log('❌ Failed');
    console.error(`   ${err.response?.data?.error || err.message}\n`);
  }

  // ── Google Sheets ──────────────────────────────────────────────────────────
  process.stdout.write('2. Google Sheets access ... ');
  try {
    const info = await verifyConnection();
    console.log('✅ Connected');
    console.log(`   Spreadsheet ID: ${info.spreadsheetId}`);
    console.log(`   Sheet name: ${info.sheetName}`);
    if (info.headerMatches) {
      console.log('   Header row: ✅ matches expected columns');
    } else {
      console.log('   ⚠️  Header mismatch — expected:');
      const { COLUMNS } = require('./src/sheets');
      console.log(`       ${COLUMNS.join(', ')}`);
      console.log(`   Found: ${info.headerRow.join(', ')}`);
    }
  } catch (err) {
    console.log('❌ Failed');
    console.error(`   ${err.message}`);
    console.error('\n   Checklist:');
    console.error('   • GOOGLE_SERVICE_ACCOUNT_KEY_FILE points to a valid JSON key file');
    console.error('   • SPREADSHEET_ID is the ID from your sheet URL');
    console.error('   • The sheet is shared with your service account email (Editor)\n');
  }

  console.log('\n──────────────────────────────────────────');
  console.log('If both checks pass, run: npm run run-now');
  console.log('To start the daily scheduler: npm start');
  console.log('──────────────────────────────────────────\n');
}

main().catch(console.error);
