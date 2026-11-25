/**
 * Run this BEFORE the first scheduled run to confirm both APIs are reachable.
 *
 *   node test-connection.js
 *
 * On success you'll see:
 *   ✓ Apollo.io   — found N contacts
 *   ✓ Google Sheets — connected to "Your Sheet Name"
 *
 * Fix any errors printed here before starting the scheduler.
 */

require('dotenv').config();

const { searchHVACLeads } = require('./src/apollo');
const { testConnection } = require('./src/sheets');

async function main() {
  let allPassed = true;

  // ── Apollo.io ─────────────────────────────────────────────────────────────
  process.stdout.write('Testing Apollo.io connection... ');
  try {
    if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set in .env');

    // Pull just 1 result to validate auth and filters
    const { contacts, totalEntries } = await searchHVACLeads(1, 1);
    console.log(`✓  Found ${totalEntries} total matching contacts in Apollo (${contacts.length} returned this call).`);

    if (contacts.length > 0) {
      const c = contacts[0];
      console.log(`   Sample: ${c.firstName} ${c.lastName} @ ${c.businessName} — ${c.city} — ${c.phone}`);
    }
  } catch (err) {
    console.log(`✗  FAILED`);
    console.error(`   ${err.message}`);
    if (err.response?.data) {
      console.error('   Apollo response:', JSON.stringify(err.response.data, null, 2));
    }
    allPassed = false;
  }

  // ── Google Sheets ─────────────────────────────────────────────────────────
  process.stdout.write('\nTesting Google Sheets connection... ');
  try {
    if (!process.env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set in .env');

    const title = await testConnection();
    console.log(`✓  Connected to spreadsheet: "${title}"`);
  } catch (err) {
    console.log(`✗  FAILED`);
    console.error(`   ${err.message}`);
    allPassed = false;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  if (allPassed) {
    console.log('All connections OK — you are ready to run  npm start');
  } else {
    console.log('One or more connections failed. Fix the errors above, then re-run this script.');
    process.exit(1);
  }
}

main();
