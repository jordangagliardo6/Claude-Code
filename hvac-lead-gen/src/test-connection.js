/**
 * Connection test — run with: npm run test-connection
 * Verifies Apollo.io and Google Sheets are reachable before the first scheduled run.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');
const { testConnection } = require('./sheets');

async function testApollo() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in .env');

  // Lightweight call — fetch the authenticated user profile
  const res = await axios.get('https://api.apollo.io/v1/auth/health', {
    params: { api_key: apiKey },
    timeout: 10000,
  });

  if (res.data?.is_logged_in) {
    return `Authenticated as: ${res.data.user?.email || '(unknown)'}`;
  }
  throw new Error('Apollo auth check returned unexpected response');
}

async function main() {
  console.log('\n====================================================');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('====================================================\n');

  // Apollo
  process.stdout.write('Checking Apollo.io connection... ');
  try {
    const info = await testApollo();
    console.log(`OK — ${info}`);
  } catch (err) {
    console.log('FAILED');
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }

  // Google Sheets
  process.stdout.write('Checking Google Sheets connection... ');
  try {
    const title = await testConnection();
    console.log(`OK — Spreadsheet: "${title}"`);
  } catch (err) {
    console.log('FAILED');
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }

  if (process.exitCode === 1) {
    console.log('\nFix the errors above, then re-run: npm run test-connection\n');
  } else {
    console.log('\nAll connections OK. Ready to run the workflow.\n');
    console.log('  npm run run-once     — run immediately (one batch)');
    console.log('  npm start            — start the scheduler (runs daily at 7am ET)\n');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
