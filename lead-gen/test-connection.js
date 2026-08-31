/**
 * First-run connection test
 * Run this before starting the scheduler to confirm both APIs are working.
 *
 *   node test-connection.js
 */

require('dotenv').config();
const { testConnection: apolloTest } = require('./apollo');
const { testConnection: sheetsTest } = require('./sheets');

async function main() {
  let allGood = true;

  // ── Apollo ────────────────────────────────────────────────────────────────
  process.stdout.write('Testing Apollo.io connection... ');
  try {
    await apolloTest();
    console.log('OK');
  } catch (err) {
    console.log(`FAILED\n  → ${err.message}`);
    allGood = false;
  }

  // ── Google Sheets ─────────────────────────────────────────────────────────
  process.stdout.write('Testing Google Sheets connection... ');
  try {
    const title = await sheetsTest();
    console.log(`OK  (sheet: "${title}")`);
  } catch (err) {
    console.log(`FAILED\n  → ${err.message}`);
    allGood = false;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  if (allGood) {
    console.log('Both connections verified. You\'re good to run: node index.js --run-now');
  } else {
    console.log('One or more connections failed. Fix the errors above before running the scheduler.');
    process.exit(1);
  }
}

main();
