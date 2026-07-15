/**
 * setup.js — First-run connection test
 *
 * Run this ONCE before your first scheduled run to verify that both
 * Apollo.io and Google Sheets are reachable and correctly configured.
 * It will also trigger the Google OAuth browser flow if you haven't
 * authorised yet.
 *
 *   node setup.js
 *
 * Expected output when everything is working:
 *   ✓ Environment variables set
 *   ✓ Apollo.io connected — N results found
 *   ✓ Google OAuth authorised
 *   ✓ Spreadsheet connected — N existing businesses
 *   ══ All systems go! ══
 */

require('dotenv').config();
const { searchLeads }                   = require('./apollo');
const { getAuthClient,
        ensureHeaders,
        getExistingBusinessNames }       = require('./sheets');
const config                            = require('./config');

const PASS = '✓';
const FAIL = '✗';

async function runSetup() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Setup & Connection Test');
  console.log('══════════════════════════════════════════════════════════\n');

  let allPassed = true;

  // ── STEP 1: Environment variables ──────────────────────────
  section('1. Environment variables');

  const required = {
    APOLLO_API_KEY:  process.env.APOLLO_API_KEY,
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  };

  for (const [key, val] of Object.entries(required)) {
    if (val) {
      pass(`${key} is set (${val.slice(0, 6)}…)`);
    } else {
      fail(`${key} is MISSING — add it to your .env file`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('\nFix the missing variables above, then re-run: node setup.js\n');
    process.exit(1);
  }

  // ── STEP 2: Apollo.io ──────────────────────────────────────
  section('2. Apollo.io API');

  try {
    const results = await searchLeads(1);
    pass(`Connected — ${results.length} lead(s) returned.`);

    if (results.length > 0) {
      const s = results[0];
      console.log(
        `   Sample: ${s.firstName} ${s.lastName} @ ${s.businessName} — ${s.phone || '(no phone)'}`
      );
    } else {
      console.warn(
        '   Warning: 0 results. This may mean:\n' +
        '   • Your Apollo plan does not have access to People Search\n' +
        '   • No HVAC businesses match the current filters\n' +
        '   • INDUSTRY_TAG_IDS in apollo.js are wrong for your account\n' +
        '   The scheduler will still run; check filters and retry.'
      );
    }
  } catch (err) {
    fail(`Apollo error: ${err.message}`);
    console.error('   Check your APOLLO_API_KEY and Apollo plan (Basic or above recommended).');
    allPassed = false;
  }

  // ── STEP 3: Google OAuth ───────────────────────────────────
  section('3. Google OAuth');

  try {
    await getAuthClient();
    pass('OAuth client authorised.');
  } catch (err) {
    fail(`Auth error: ${err.message}`);
    allPassed = false;
  }

  // ── STEP 4: Google Sheets ──────────────────────────────────
  section('4. Google Sheets');

  try {
    await ensureHeaders();
    pass('Header row verified.');

    const existing = await getExistingBusinessNames();
    pass(`Spreadsheet connected — ${existing.size} existing business(es) on record.`);
    console.log(`   Sheet ID: ${config.GOOGLE_SHEET_ID}`);
    console.log(`   Tab name: ${config.SHEET_TAB_NAME}`);
  } catch (err) {
    fail(`Sheets error: ${err.message}`);
    console.error(
      '   Checklist:\n' +
      '   • GOOGLE_SHEET_ID is correct\n' +
      '   • The tab is named exactly "Leads" (or update SHEET_TAB_NAME in config.js)\n' +
      '   • Google Sheets API is enabled in your Google Cloud project\n' +
      '   • The authorised account has editor access to the spreadsheet'
    );
    allPassed = false;
  }

  // ── RESULT ─────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  ✓ All systems go! You are ready to run.');
    console.log('\n  Next steps:');
    console.log('    • Run right now:           node run-now.js');
    console.log('    • Start the 7 AM scheduler: node index.js');
    console.log('    • Keep it running 24/7:     pm2 start index.js --name hvac-leads');
  } else {
    console.log('  ✗ Some checks failed — see errors above.');
  }
  console.log('══════════════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

function section(title) { console.log(`\n${title}`); }
function pass(msg)       { console.log(`  ${PASS} ${msg}`); }
function fail(msg)       { console.error(`  ${FAIL} ${msg}`); }

runSetup().catch(err => {
  console.error('\nUnexpected setup error:', err.message);
  process.exit(1);
});
