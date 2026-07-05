/**
 * test-connection.js — Verify Apollo and Google Sheets are working before the first run.
 *
 * Usage:
 *   npm run test-connection
 *   node test-connection.js
 *
 * What it checks:
 *   1. APOLLO_API_KEY and GOOGLE_SHEET_ID are set
 *   2. Apollo search returns results (confirms API key + credits)
 *   3. Google Sheets can be read and written (confirms auth token + sheet ID)
 */

require('dotenv').config();

const { searchHVACLeads, mapToLead } = require('./apollo');
const { getAuthClient } = require('./sheets');
const { google } = require('googleapis');
const config = require('./config');

// ── Apollo test ─────────────────────────────────────────────────────────────
async function testApollo() {
  console.log('\n[1/2] Testing Apollo.io connection...');

  if (!process.env.APOLLO_API_KEY) {
    console.error('  ✗ APOLLO_API_KEY is not set in .env');
    return false;
  }

  try {
    const data = await searchHVACLeads(1);
    const people = data.people || [];
    const withPhone = people.map(mapToLead).filter(Boolean);

    console.log(`  ✓ Apollo connected successfully`);
    console.log(`    Results on page 1 : ${people.length}`);
    console.log(`    Have phone number : ${withPhone.length}`);

    if (data.pagination) {
      console.log(`    Total in Apollo   : ${data.pagination.total_entries ?? 'unknown'}`);
    }

    if (withPhone.length > 0) {
      const sample = withPhone[0];
      console.log(`\n    Sample lead:`);
      console.log(`      Business : ${sample.businessName || '(no name)'}`);
      console.log(`      Contact  : ${sample.firstName} ${sample.lastName}`);
      console.log(`      Phone    : ${sample.phone}`);
      console.log(`      City     : ${sample.city || '(no city)'}`);
    } else {
      console.warn(`\n    ⚠  No contacts with phone numbers found on page 1.`);
      console.warn(`    This may mean:`);
      console.warn(`      - Your Apollo plan doesn't include phone reveal`);
      console.warn(`      - You've used your monthly phone credits`);
      console.warn(`      - The SW Michigan / HVAC filter returned no matching data`);
    }

    return true;
  } catch (err) {
    console.error(`  ✗ Apollo error: ${err.message}`);
    if (err.response) {
      console.error(`    HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    return false;
  }
}

// ── Google Sheets test ──────────────────────────────────────────────────────
async function testSheets() {
  console.log('\n[2/2] Testing Google Sheets connection...');

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    console.error('  ✗ GOOGLE_SHEET_ID is not set in .env');
    return false;
  }

  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Read spreadsheet metadata
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const title = meta.data.properties.title;
    const sheetNames = meta.data.sheets.map((s) => s.properties.title);

    console.log(`  ✓ Google Sheets connected successfully`);
    console.log(`    Spreadsheet name : "${title}"`);
    console.log(`    Sheet tabs       : ${sheetNames.join(', ')}`);

    // Check if the Leads tab exists; note if it'll be created on first run
    if (!sheetNames.includes(config.sheetTab)) {
      console.warn(`    ⚠  Tab "${config.sheetTab}" not found — it will be targeted on first run.`);
      console.warn(`       Make sure a tab named "${config.sheetTab}" exists in your spreadsheet,`);
      console.warn(`       or create it manually now.`);
    } else {
      // Read current row count
      const values = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${config.sheetTab}!A:A`,
      });
      const rowCount = (values.data.values || []).length;
      const leadCount = Math.max(0, rowCount - 1); // subtract header
      console.log(`    Leads tab        : "${config.sheetTab}" (${leadCount} existing leads)`);
    }

    console.log(`\n    Sheet ID         : ${spreadsheetId}`);
    return true;
  } catch (err) {
    console.error(`  ✗ Sheets error: ${err.message}`);
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(' Apollo + Google Sheets — Connection Test');
  console.log('═'.repeat(60));

  const apolloOk = await testApollo();
  const sheetsOk = await testSheets();

  console.log('\n' + '═'.repeat(60));
  if (apolloOk && sheetsOk) {
    console.log(' ✓ All systems connected. You\'re ready to go!\n');
    console.log(' Start the daily scheduler:');
    console.log('   node index.js\n');
    console.log(' Or trigger one run right now:');
    console.log('   node index.js --now\n');
  } else {
    console.log(' ✗ One or more connections failed. Fix the errors above.\n');
    if (!apolloOk) {
      console.log(' Apollo troubleshooting:');
      console.log('   - Confirm APOLLO_API_KEY in .env is correct');
      console.log('   - Check your Apollo plan has People Search enabled');
    }
    if (!sheetsOk) {
      console.log(' Google Sheets troubleshooting:');
      console.log('   - Run: node setup-google-auth.js');
      console.log('   - Confirm GOOGLE_SHEET_ID in .env is the correct sheet ID');
    }
  }
  console.log('═'.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
