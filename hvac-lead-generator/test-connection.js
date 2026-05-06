'use strict';

/**
 * Connection test — run this BEFORE the first scheduled run.
 *
 *   npm run test-connection
 *
 * Checks:
 *   1. Apollo API key is valid
 *   2. Google Sheets credentials can open the target spreadsheet
 *   3. Header row is written (idempotent — safe to run multiple times)
 *   4. Prints a live sample of up to 3 Apollo results so you can confirm
 *      the filters are finding the right contacts
 */

require('dotenv').config();

const { verifyApolloConnection, searchLeads } = require('./src/apolloSearch');
const { verifySheetsConnection, ensureHeaderRow } = require('./src/sheetsManager');
const logger = require('./src/logger');

// Simple pass/fail indicator
const OK   = '✓';
const FAIL = '✗';

async function run() {
  let allPassed = true;

  console.log('\n══════════════════════════════════════════════');
  console.log('  HVAC Lead Generator — Connection Test');
  console.log('══════════════════════════════════════════════\n');

  // ── 1. Apollo API ──────────────────────────────────────────────────────
  process.stdout.write('  Apollo API key ... ');
  try {
    const email = await verifyApolloConnection();
    console.log(`${OK}  (authenticated as ${email})`);
  } catch (err) {
    console.log(`${FAIL}  ${err.message}`);
    allPassed = false;
  }

  // ── 2. Google Sheets ───────────────────────────────────────────────────
  process.stdout.write('  Google Sheets    ... ');
  try {
    const title = await verifySheetsConnection();
    console.log(`${OK}  (spreadsheet: "${title}")`);
  } catch (err) {
    console.log(`${FAIL}  ${err.message}`);
    allPassed = false;
  }

  // ── 3. Header row ──────────────────────────────────────────────────────
  process.stdout.write('  Header row       ... ');
  try {
    await ensureHeaderRow();
    console.log(`${OK}  (written or already present)`);
  } catch (err) {
    console.log(`${FAIL}  ${err.message}`);
    allPassed = false;
  }

  // ── 4. Sample Apollo search ────────────────────────────────────────────
  console.log('\n  Fetching up to 3 sample leads from Apollo...\n');
  try {
    const sample = await searchLeads(10); // fetch 10, display up to 3
    if (sample.length === 0) {
      console.log('  ⚠  Apollo returned 0 results. Check your API key quota and filters.');
      console.log('     (This is a warning, not a hard failure — the workflow will retry on schedule.)');
    } else {
      const preview = sample.slice(0, 3);
      preview.forEach((lead, i) => {
        console.log(`  Lead ${i + 1}:`);
        console.log(`    Business : ${lead.businessName}`);
        console.log(`    Contact  : ${lead.firstName} ${lead.lastName}`);
        console.log(`    Phone    : ${lead.phone}`);
        console.log(`    City     : ${lead.city}`);
        console.log(`    Website  : ${lead.website || '(none)'}`);
        console.log('');
      });
      if (sample.length > 3) {
        console.log(`  ... and ${sample.length - 3} more lead(s) available this run.\n`);
      }
    }
  } catch (err) {
    console.log(`  ${FAIL}  Sample search failed: ${err.message}`);
    allPassed = false;
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════');
  if (allPassed) {
    console.log('  All checks passed. You\'re ready to go!');
    console.log('');
    console.log('  Next steps:');
    console.log('    • Run the workflow once manually:  npm run run-once');
    console.log('    • Start the daily scheduler:       npm start');
    console.log('    • Runs every day at 7:00 AM Eastern Time');
  } else {
    console.log('  One or more checks failed. Fix the errors above then re-run:');
    console.log('    npm run test-connection');
  }
  console.log('══════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  logger.error(`Unexpected error in test-connection: ${err.message}`);
  process.exit(1);
});
