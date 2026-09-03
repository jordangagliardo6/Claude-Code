/**
 * Entry point
 *
 * Usage:
 *   node index.js                   Start scheduler (runs daily at 7am ET)
 *   node index.js --test-connection Verify Apollo + Google Sheets credentials
 *   node index.js --run-now         Run the workflow immediately, then stay scheduled
 *   node index.js --dry-run         Preview leads without writing to Sheets
 */

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const { testConnection } = require('./src/sheets');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isTestConnection = args.includes('--test-connection');
const isRunNow = args.includes('--run-now');

(async () => {
  // ── Test connection mode ────────────────────────────────────────────────────
  if (isTestConnection) {
    console.log('\n── Connection Test ──────────────────────────────────────────');

    // Apollo check
    console.log('\n1. Checking Apollo.io API key...');
    if (!process.env.APOLLO_API_KEY) {
      console.error('   ✗  APOLLO_API_KEY is not set in .env');
      process.exit(1);
    }
    // Basic format check — real validation happens on first search
    console.log(`   ✓  APOLLO_API_KEY is set (${process.env.APOLLO_API_KEY.slice(0, 6)}...)`);

    // Google Sheets check
    console.log('\n2. Checking Google Sheets connection...');
    try {
      const { spreadsheetTitle } = await testConnection();
      console.log(`   ✓  Connected — spreadsheet: "${spreadsheetTitle}"`);
    } catch (err) {
      console.error(`   ✗  Google Sheets error: ${err.message}`);
      process.exit(1);
    }

    console.log('\n✓ All connections OK. Ready to run.\n');
    console.log('Next step: run `npm run run-now` to do a live test pull, or');
    console.log('           run `npm start` to start the daily 7am ET schedule.\n');
    process.exit(0);
  }

  // ── Dry-run mode ────────────────────────────────────────────────────────────
  if (isDryRun) {
    await runWorkflow({ maxLeads: 10, dryRun: true });
    process.exit(0);
  }

  // ── Run immediately (then also start the scheduler) ─────────────────────────
  if (isRunNow) {
    console.log('Running workflow now...');
    await runWorkflow({ maxLeads: 25 });
  }

  // ── Scheduler ───────────────────────────────────────────────────────────────
  // '0 7 * * *' = every day at 7:00 AM in the specified timezone
  cron.schedule('0 7 * * *', async () => {
    await runWorkflow({ maxLeads: 25 });
  }, {
    timezone: 'America/New_York', // Eastern Time — handles EST/EDT automatically
  });

  console.log('\n── HVAC Lead Gen Scheduler ──────────────────────────────────');
  console.log('   Schedule : Every day at 7:00 AM Eastern Time');
  console.log('   Max leads: 25 per run');
  console.log('   Sheet tab: ' + (process.env.GOOGLE_SHEET_TAB || 'Sheet1'));
  console.log('\n   Running... Press Ctrl+C to stop.\n');
})();
