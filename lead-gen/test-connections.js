/**
 * test-connections.js — First-run verification
 *
 * Confirms your Apollo API key and Google Sheets credentials are working
 * BEFORE the scheduler starts. Run this once before going live:
 *
 *   cd lead-gen
 *   npm install
 *   npm test
 */

require('dotenv').config();

const axios = require('axios');
const { verifyConnection, getExistingBusinessNames } = require('./sheets');
const { sendAlert } = require('./notify');

async function testApollo() {
  console.log('\n── Apollo.io ────────────────────────────────────────────');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    throw new Error('APOLLO_API_KEY is not set in .env');
  }

  // Hit the lightweight /health or account endpoint
  const response = await axios.post(
    'https://api.apollo.io/v1/auth/health',
    {},
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  const status = response.data?.is_logged_in
    ? '✓ Connected'
    : '✓ Responded (check plan level for People Search)';

  console.log(`  Status: ${status}`);
  console.log(`  Data: ${JSON.stringify(response.data)}`);

  // Warn if on free plan
  if (!response.data?.is_logged_in) {
    console.warn(
      '\n  ⚠️  NOTE: The People Search API (/v1/mixed_people/search) requires\n' +
        '     Apollo Basic plan ($49/mo) or higher.\n' +
        '     Free plan will return a 403 on the actual search run.\n' +
        '     Upgrade at: https://www.apollo.io/pricing'
    );
  }

  return true;
}

async function testGoogleSheets() {
  console.log('\n── Google Sheets ────────────────────────────────────────');

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env');
  }

  const title = await verifyConnection();
  console.log(`  ✓ Connected to spreadsheet: "${title}"`);
  console.log(`  Sheet ID: ${sheetId}`);

  const existing = await getExistingBusinessNames();
  console.log(`  ✓ Read ${existing.size} existing business names`);

  return true;
}

async function testAlerts() {
  console.log('\n── Email Alerts ─────────────────────────────────────────');

  const alertEmail = process.env.ALERT_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!alertEmail || !smtpUser || !smtpPass) {
    console.log('  ℹ  Email alerts not configured (ALERT_EMAIL / SMTP_USER / SMTP_PASS missing)');
    console.log('     Errors will be logged to console only.');
    return true;
  }

  await sendAlert(
    'Test alert from HVAC Lead Gen',
    'If you received this, email alerts are working correctly!'
  );
  console.log(`  ✓ Test alert sent to ${alertEmail}`);
  return true;
}

// ── Run all tests ─────────────────────────────────────────────────────────────

(async () => {
  console.log('='.repeat(60));
  console.log('HVAC Lead Gen — Connection Test');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const [name, fn] of [
    ['Apollo.io', testApollo],
    ['Google Sheets', testGoogleSheets],
    ['Email Alerts', testAlerts],
  ]) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`\n  ✗ ${name} FAILED: ${err.message}`);
      if (err.response?.data) {
        console.error(`    API response: ${JSON.stringify(err.response.data)}`);
      }
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\n✅  All connections verified. You are ready to run:\n');
    console.log('    node index.js --now    ← run one pull immediately');
    console.log('    node index.js          ← start the daily 7am scheduler');
  } else {
    console.log(
      '\n❌  Fix the errors above before starting the scheduler.'
    );
    process.exit(1);
  }
})();
