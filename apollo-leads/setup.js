/**
 * First-run setup verification.
 * Tests Apollo API and Google Sheets connections before the scheduler starts.
 *
 * Run: node setup.js
 */

require('dotenv').config();

const axios  = require('axios');
const { testConnection, ensureHeaders } = require('./src/sheets');
const logger = require('./src/logger');

const APOLLO_KEY = process.env.APOLLO_API_KEY;
const SHEET_ID   = process.env.GOOGLE_SHEET_ID;

async function testApollo() {
  if (!APOLLO_KEY) {
    return { ok: false, message: 'APOLLO_API_KEY is not set in .env' };
  }

  try {
    // Lightweight call: fetch your Apollo account profile
    const res = await axios.get(`https://api.apollo.io/api/v1/auth/health?api_key=${APOLLO_KEY}`, {
      timeout: 10_000,
    });
    const isHealthy = res.data?.is_logged_in === true;
    if (isHealthy) {
      return { ok: true, message: 'Apollo API key is valid and authenticated' };
    }
    return { ok: false, message: `Apollo health check returned unexpected response: ${JSON.stringify(res.data)}` };
  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.message || err.message;
    if (status === 401) {
      return { ok: false, message: 'Apollo API key is invalid or expired (401 Unauthorized)' };
    }
    return { ok: false, message: `Apollo connection error (HTTP ${status}): ${message}` };
  }
}

async function main() {
  console.log('\n🔍  Running setup verification...\n');

  // Test Apollo
  process.stdout.write('  [1/3] Apollo API key... ');
  const apolloResult = await testApollo();
  console.log(apolloResult.ok ? `✅  ${apolloResult.message}` : `❌  ${apolloResult.message}`);

  // Test Google Sheets connection
  process.stdout.write('  [2/3] Google Sheets connection... ');
  const sheetsResult = await testConnection(SHEET_ID);
  console.log(sheetsResult.ok ? `✅  ${sheetsResult.message}` : `❌  ${sheetsResult.message}`);

  // Ensure headers are written
  if (sheetsResult.ok) {
    process.stdout.write('  [3/3] Ensuring spreadsheet headers... ');
    try {
      await ensureHeaders(SHEET_ID);
      console.log('✅  Headers look good');
    } catch (err) {
      console.log(`❌  ${err.message}`);
    }
  } else {
    console.log('  [3/3] Skipped (Sheets connection failed)');
  }

  const allOk = apolloResult.ok && sheetsResult.ok;

  console.log('\n' + '─'.repeat(55));
  if (allOk) {
    console.log('  ✅  All checks passed! You\'re ready to run:');
    console.log('      npm start          — starts the daily 7am scheduler');
    console.log('      npm run run-now    — run a batch immediately');
  } else {
    console.log('  ❌  Setup incomplete. Fix the errors above, then re-run:');
    console.log('      node setup.js');
    console.log('\n  See the README for detailed setup instructions.');
    process.exitCode = 1;
  }
  console.log('─'.repeat(55) + '\n');
}

main().catch((err) => {
  console.error(`Setup error: ${err.message}`);
  process.exit(1);
});
