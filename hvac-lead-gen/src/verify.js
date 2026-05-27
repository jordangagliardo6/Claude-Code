// Run this BEFORE your first scheduled run to confirm both APIs are reachable.
//   node src/verify.js   (or: npm run verify)
require('dotenv').config();

const { verifyConnection: apolloCheck }  = require('./apollo');
const { verifyConnection: sheetsCheck }  = require('./sheets');

const REQUIRED_VARS = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
const CRED_VARS     = ['GOOGLE_SERVICE_ACCOUNT_KEY_FILE', 'GOOGLE_SERVICE_ACCOUNT_JSON'];

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  HVAC Lead Gen — Connection Verification  ║');
  console.log('╚══════════════════════════════════════════╝\n');

  let ok = true;

  // 1. Required env vars
  console.log('── Environment variables ──────────────────');
  for (const v of REQUIRED_VARS) {
    if (process.env[v]) {
      console.log(`  ✓  ${v}`);
    } else {
      console.error(`  ✗  ${v}  ← MISSING`);
      ok = false;
    }
  }

  const hasCreds = CRED_VARS.some(v => process.env[v]);
  if (hasCreds) {
    const used = CRED_VARS.find(v => process.env[v]);
    console.log(`  ✓  ${used}  (Google credentials)`);
  } else {
    console.error(`  ✗  GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_JSON  ← MISSING`);
    ok = false;
  }

  if (!ok) {
    console.error('\n  Fix the missing variables in your .env file, then re-run: npm run verify\n');
    process.exit(1);
  }

  // 2. Apollo.io connectivity
  console.log('\n── Apollo.io ───────────────────────────────');
  try {
    await apolloCheck();
    console.log('  ✓  Connected — API key is valid');
  } catch (err) {
    console.error(`  ✗  Failed: ${err.message}`);
    ok = false;
  }

  // 3. Google Sheets connectivity
  console.log('\n── Google Sheets ───────────────────────────');
  try {
    const title = await sheetsCheck();
    console.log(`  ✓  Connected — spreadsheet: "${title}"`);
  } catch (err) {
    console.error(`  ✗  Failed: ${err.message}`);
    ok = false;
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════╗');
  if (ok) {
    console.log('║  All checks passed — ready to run!        ║');
    console.log('╚══════════════════════════════════════════╝\n');
    console.log('  Run the workflow once now:    npm run run-once');
    console.log('  Start the daily scheduler:   npm start\n');
  } else {
    console.error('║  One or more checks failed — see above.   ║');
    console.error('╚══════════════════════════════════════════╝\n');
    process.exit(1);
  }
}

main();
