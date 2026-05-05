'use strict';

/**
 * setup.js — first-run connection verification
 *
 * Run ONCE before starting the scheduler to confirm:
 *   ✓ Apollo.io API key is valid
 *   ✓ Google Sheets is reachable and the spreadsheet exists
 *   ✓ Sheet headers are written (creates them if missing)
 *   ✓ A small test Apollo query returns results
 *
 * Usage:  node setup.js
 *
 * What it does NOT do:
 *   - It does not write any leads to your sheet.
 *   - It does not start the scheduler.
 */

require('dotenv').config();
const apollo  = require('./src/apollo');
const sheets  = require('./src/sheets');
const logger  = require('./src/logger');

const PASS = '  ✓';
const FAIL = '  ✗';

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  HVAC Lead-Gen — First-Run Setup Check');
  console.log('══════════════════════════════════════════\n');

  let allPassed = true;

  // ── 1. Environment variables ─────────────────────────────────────────────
  console.log('[ Step 1 ] Checking environment variables…');

  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const authVars = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
    ? ['GOOGLE_SERVICE_ACCOUNT_KEY_FILE']
    : ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];

  const allRequired = [...required, ...authVars];

  for (const key of allRequired) {
    if (process.env[key]) {
      console.log(`${PASS} ${key} is set`);
    } else {
      console.log(`${FAIL} ${key} is MISSING — add it to .env`);
      allPassed = false;
    }
  }

  if (process.env.ALERT_EMAIL) {
    console.log(`${PASS} ALERT_EMAIL is set → ${process.env.ALERT_EMAIL}`);
  } else {
    console.log('       ALERT_EMAIL not set (optional — errors will only log to console)');
  }

  // ── 2. Apollo.io connectivity ────────────────────────────────────────────
  console.log('\n[ Step 2 ] Testing Apollo.io connection…');
  try {
    await apollo.testConnection();
    console.log(`${PASS} Apollo.io API key is valid`);
  } catch (err) {
    console.log(`${FAIL} Apollo.io connection failed: ${err.message}`);
    allPassed = false;
  }

  // ── 3. Apollo test search ────────────────────────────────────────────────
  console.log('\n[ Step 3 ] Running a small Apollo test search (1 result)…');
  try {
    const contacts = await apollo.searchLeads(1);
    if (contacts.length > 0) {
      const c = contacts[0];
      console.log(`${PASS} Apollo returned at least 1 contact:`);
      console.log(`       Name    : ${c.firstName} ${c.lastName}`);
      console.log(`       Title   : ${c.title}`);
      console.log(`       Company : ${c.companyName}`);
      console.log(`       City    : ${c.city}`);
      console.log(`       Phone   : ${c.phone || '(not revealed — check Apollo plan)'}`);
    } else {
      console.log('       Apollo returned 0 contacts for the current search config.');
      console.log('       This is not an error — the search may need location tuning.');
      console.log('       Check src/apollo.js → TARGET_LOCATIONS and INDUSTRY_KEYWORDS.');
    }
  } catch (err) {
    console.log(`${FAIL} Apollo test search failed: ${err.message}`);
    allPassed = false;
  }

  // ── 4. Google Sheets connectivity ────────────────────────────────────────
  console.log('\n[ Step 4 ] Testing Google Sheets connection…');
  try {
    const title = await sheets.testConnection();
    console.log(`${PASS} Google Sheets reachable — spreadsheet: "${title}"`);
  } catch (err) {
    console.log(`${FAIL} Google Sheets connection failed: ${err.message}`);
    console.log('       Common fixes:');
    console.log('         • Share the spreadsheet with your service-account email (Editor)');
    console.log('         • Verify GOOGLE_SPREADSHEET_ID matches the URL of your sheet');
    console.log('         • Confirm the service-account key file path is correct');
    allPassed = false;
  }

  // ── 5. Ensure headers ────────────────────────────────────────────────────
  if (allPassed) {
    console.log('\n[ Step 5 ] Writing headers to spreadsheet (safe if already present)…');
    try {
      await sheets.ensureHeaders();
      console.log(`${PASS} Headers confirmed in sheet`);
    } catch (err) {
      console.log(`${FAIL} Could not write headers: ${err.message}`);
      allPassed = false;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  if (allPassed) {
    console.log('  All checks passed!');
    console.log('  ► Run once now:     node run-now.js');
    console.log('  ► Start scheduler:  node index.js');
    console.log('    (or: pm2 start index.js --name lead-gen)');
  } else {
    console.log('  One or more checks failed.');
    console.log('  Fix the issues above, then re-run: node setup.js');
  }
  console.log('══════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  logger.error(`Unexpected setup error: ${err.message}`);
  process.exit(1);
});
