/**
 * Connection verification script
 *
 * Run this BEFORE starting the scheduler to confirm both APIs are working.
 * It reads a few leads from Apollo and reads your sheet — it does NOT write
 * anything.
 *
 *   npm run verify
 */

'use strict';

require('dotenv').config();

const { searchLeads }             = require('./apollo');
const { ensureHeaders, getExistingBusinessNames } = require('./sheets');

async function verify() {
  let apolloOk = false;
  let sheetsOk = false;

  console.log('\n' + '═'.repeat(55));
  console.log('  Apollo Lead Gen — Connection Verification');
  console.log('═'.repeat(55));

  // ── 1. Apollo ──────────────────────────────────────────
  console.log('\n1. Apollo.io API');

  if (!process.env.APOLLO_API_KEY) {
    console.error('   ✗  APOLLO_API_KEY is not set in your .env file');
  } else {
    try {
      console.log('   → Searching for 3 sample leads…');
      const leads = await searchLeads(3);

      if (leads.length === 0) {
        console.warn('   ⚠  Apollo responded but returned 0 contacts.');
        console.warn('      Check that your plan has search credits and that');
        console.warn('      the industry/location filters match real companies.');
      } else {
        const s = leads[0];
        console.log(`   ✓  Connected — got ${leads.length} sample result(s)`);
        console.log(`      Example: ${s.firstName} ${s.lastName} | ${s.businessName} | ${s.city} | ${s.phone}`);
        apolloOk = true;
      }
    } catch (err) {
      console.error('   ✗  Apollo error:', err.message);
      if (err.response) {
        console.error('      Status:', err.response.status);
        console.error('      Body:  ', JSON.stringify(err.response.data).slice(0, 200));
      }
    }
  }

  // ── 2. Google Sheets ───────────────────────────────────
  console.log('\n2. Google Sheets');

  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    console.error('   ✗  GOOGLE_SPREADSHEET_ID is not set in your .env file');
  } else {
    try {
      console.log('   → Connecting to spreadsheet…');
      await ensureHeaders();
      const names = await getExistingBusinessNames();
      console.log(`   ✓  Connected — sheet currently has ${names.size} lead(s)`);
      console.log(`      Tab: "${process.env.GOOGLE_SHEET_TAB || 'Leads'}"`);
      sheetsOk = true;
    } catch (err) {
      console.error('   ✗  Sheets error:', err.message);
      if (err.message.includes('credentials')) {
        console.error('      Make sure credentials.json exists and the service account');
        console.error('      has been shared on the spreadsheet (see SETUP.md).');
      }
    }
  }

  // ── Summary ────────────────────────────────────────────
  console.log('\n' + '═'.repeat(55));
  if (apolloOk && sheetsOk) {
    console.log('  ✓  All systems go!');
    console.log('\n  Next steps:');
    console.log('    npm run run-now   ← run once right now to test end-to-end');
    console.log('    npm start         ← start the daily 7 AM scheduler');
  } else {
    console.log('  ✗  Fix the issues above, then re-run: npm run verify');
  }
  console.log('═'.repeat(55) + '\n');

  process.exit(apolloOk && sheetsOk ? 0 : 1);
}

verify().catch(err => {
  console.error('Verification script crashed:', err.message);
  process.exit(1);
});
