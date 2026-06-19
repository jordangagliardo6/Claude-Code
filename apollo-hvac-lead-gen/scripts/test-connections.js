// Verifies the Apollo API key and Google OAuth token both work before you
// turn on the scheduler. Run with `npm run test-connections`.
require('dotenv').config();
const apollo = require('../src/apolloClient');
const sheets = require('../src/googleSheets');

async function main() {
  let ok = true;

  console.log('Testing Apollo.io connection...');
  try {
    await apollo.testConnection();
    console.log('  Apollo.io connected successfully.');
  } catch (err) {
    console.error('  Apollo.io connection failed:', err.message);
    ok = false;
  }

  console.log('Testing Google Sheets connection...');
  try {
    const client = sheets.getClient();
    await sheets.testConnection(client);
    console.log('  Google Sheets connected successfully.');
  } catch (err) {
    console.error('  Google Sheets connection failed:', err.message);
    ok = false;
  }

  if (!ok) {
    console.error('\nOne or more connections failed. Fix the issue(s) above before running the scheduler.');
    process.exit(1);
  }

  console.log('\nBoth connections are working. Safe to run `npm run run-once` or `npm start`.');
}

main();
