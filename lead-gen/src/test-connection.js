/**
 * Run this before your first scheduled run to confirm both APIs are reachable.
 * Usage: npm run test-connection
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');
const { testConnection: testSheets } = require('./sheets');
const { apollo } = require('./config');

async function main() {
  let allGood = true;

  // --- Test Apollo ---
  process.stdout.write('Testing Apollo.io connection… ');
  try {
    if (!apollo.apiKey) throw new Error('APOLLO_API_KEY not set in .env');
    const res = await axios.post(
      `${apollo.baseUrl}/users/api_profile`,
      { api_key: apollo.apiKey },
      { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
    );
    const user = res.data?.user;
    if (!user) throw new Error('Unexpected response shape from Apollo');
    console.log(`OK — logged in as ${user.email || user.name || '(unknown user)'}`);
  } catch (err) {
    console.log(`FAILED\n  → ${err.response?.data?.message || err.message}`);
    allGood = false;
  }

  // --- Test Google Sheets ---
  process.stdout.write('Testing Google Sheets connection… ');
  try {
    const title = await testSheets();
    console.log(`OK — spreadsheet title: "${title}"`);
  } catch (err) {
    console.log(`FAILED\n  → ${err.message}`);
    allGood = false;
  }

  console.log('');
  if (allGood) {
    console.log('All connections verified. You are ready to run: npm start');
  } else {
    console.log('One or more connections failed. Fix the errors above before starting the scheduler.');
    process.exit(1);
  }
}

main();
