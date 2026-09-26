/**
 * First-run setup & connectivity test.
 * Run with:  node setup.js
 *
 * Checks Apollo and Google Sheets before you start the scheduler.
 * Offers a live test run at the end.
 */

require('dotenv').config();
const readline = require('readline');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   HVAC Leads — Setup & Connectivity Test         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const config = require('./src/config');
  let apolloOk = false;
  let sheetsOk = false;

  // ── 1. Apollo.io ────────────────────────────────────────────────────────────
  console.log('1/2  Testing Apollo.io…');

  if (!config.apolloApiKey) {
    console.error('     ❌ APOLLO_API_KEY not set in .env\n');
  } else {
    try {
      const { searchHvacLeads } = require('./src/apollo');
      const data = await searchHvacLeads(1, 1);
      const total = data.pagination?.total_entries ?? (data.people?.length ?? 0);
      console.log(`     ✅ Connected — ${total.toLocaleString()} leads available in this search\n`);
      apolloOk = true;
    } catch (err) {
      console.error(`     ❌ ${err.message}`);
      if (err.response?.status === 401) {
        console.error('        → Invalid APOLLO_API_KEY — check your .env file');
      } else if (err.response?.status === 422) {
        console.error('        → Search filters rejected — check config.js');
        console.error('        →', JSON.stringify(err.response.data).slice(0, 200));
      } else if (err.response?.data?.message) {
        console.error('        →', err.response.data.message);
      }
      console.log();
    }
  }

  // ── 2. Google Sheets ────────────────────────────────────────────────────────
  console.log('2/2  Testing Google Sheets…');

  if (!config.googleSpreadsheetId) {
    console.error('     ❌ GOOGLE_SPREADSHEET_ID not set in .env\n');
  } else {
    try {
      const { testConnection, getExistingBusinessNames } = require('./src/sheets');
      const info = await testConnection();
      const existing = await getExistingBusinessNames();
      console.log(`     ✅ Connected`);
      console.log(`        Title     : ${info.title}`);
      console.log(`        Leads now : ${existing.size} existing entries`);
      console.log(`        URL       : ${info.url}\n`);
      sheetsOk = true;
    } catch (err) {
      console.error(`     ❌ ${err.message}`);
      if (err.code === 'ENOENT') {
        console.error(`        → Credentials file not found: ${err.path}`);
        console.error('        → See SETUP.md for instructions on creating a Google Service Account');
      } else if (err.message?.includes('PERMISSION_DENIED') || err.status === 403) {
        console.error('        → Access denied: share the spreadsheet with your service account email');
        console.error('          (the email ends in @...iam.gserviceaccount.com)');
      } else if (err.message?.includes('invalid_grant')) {
        console.error('        → Service account credentials are invalid or expired');
      }
      console.log();
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('┌──────────────────────────────────────┐');
  console.log(`│  Apollo.io     : ${apolloOk ? '✅ Connected         ' : '❌ Not connected     '}│`);
  console.log(`│  Google Sheets : ${sheetsOk ? '✅ Connected         ' : '❌ Not connected     '}│`);
  console.log('└──────────────────────────────────────┘\n');

  if (!apolloOk || !sheetsOk) {
    console.log('Fix the errors above, then run `node setup.js` again.\n');
    process.exit(1);
  }

  // ── Offer live run ───────────────────────────────────────────────────────────
  const answer = await ask('✅ All systems go! Run the workflow now? [y/N] ');

  if (answer === 'y' || answer === 'yes') {
    console.log('\nRunning workflow…\n');
    const { runWorkflow } = require('./src/workflow');
    const result = await runWorkflow();

    if (result.success) {
      console.log('✅ Done. Check your spreadsheet:');
      console.log(`   https://docs.google.com/spreadsheets/d/${require('./src/config').googleSpreadsheetId}\n`);
    }
  } else {
    console.log('\nRun options:');
    console.log('  node index.js       — start the daily 7 AM scheduler');
    console.log('  npm run run-now     — run once immediately\n');
  }
}

main().catch(err => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
