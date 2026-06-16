/**
 * index.js — Entry point
 *
 * Modes:
 *   node index.js              Start the scheduler (runs every day at 7:00 AM ET)
 *   node index.js --test       Test Apollo + Google Sheets connectivity and exit
 *   node index.js --run        Run the workflow once immediately and exit
 *
 * npm shortcuts (package.json):
 *   npm start                  Start the scheduler
 *   npm run test-connections   Connection test
 *   npm run run-now            Immediate single run
 */

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./workflow');
const { testConnection: testSheets } = require('./sheets');

const args = process.argv.slice(2);

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnections() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('══════════════════════════════════════════════════\n');

  let allOk = true;

  // Apollo key presence check (we can't make a live call without consuming a search)
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    console.error('❌  APOLLO_API_KEY is not set in .env');
    allOk = false;
  } else {
    console.log(`✅  Apollo API key found  (${apolloKey.slice(0, 6)}••••••)`);
  }

  // Google Sheets live connectivity check
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error('❌  GOOGLE_SPREADSHEET_ID is not set in .env');
    allOk = false;
  } else {
    try {
      const title = await testSheets();
      console.log(`✅  Google Sheets connected  → "${title}"`);
    } catch (err) {
      console.error(`❌  Google Sheets connection failed: ${err.message}`);
      console.error(
        '    Check that GOOGLE_CREDENTIALS_PATH points to a valid service account JSON'
      );
      console.error(
        '    and that the sheet is shared with the service account email address.'
      );
      allOk = false;
    }
  }

  // Email config (optional — just warn if missing)
  if (!process.env.EMAIL_FROM || !process.env.EMAIL_APP_PASSWORD) {
    console.warn(
      '⚠️   Email alerts disabled  (EMAIL_FROM / EMAIL_APP_PASSWORD not set — errors will be console/file only)'
    );
  } else {
    console.log(`✅  Email alerts configured  → ${process.env.EMAIL_TO || process.env.EMAIL_FROM}`);
  }

  console.log('\n──────────────────────────────────────────────────');
  if (allOk) {
    console.log('✅  All connections OK — you are ready to run.\n');
    console.log('    Start the scheduler : npm start');
    console.log('    Run once right now  : npm run run-now');
  } else {
    console.log('❌  Fix the errors above before starting the scheduler.\n');
    process.exit(1);
  }
  console.log('══════════════════════════════════════════════════\n');
}

// ─── Env validation ───────────────────────────────────────────────────────────

function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Fatal: missing required environment variable(s): ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (args.includes('--test')) {
    await testConnections();
    return;
  }

  if (args.includes('--run')) {
    validateEnv();
    console.log('Running workflow immediately…\n');
    await runWorkflow();
    return;
  }

  // ── Scheduler mode ──────────────────────────────────────────────────────
  validateEnv();

  console.log('══════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen Scheduler');
  console.log('══════════════════════════════════════════════════');
  console.log('  Schedule : 7:00 AM Eastern Time, every day');
  console.log('  Max leads: ' + (process.env.MAX_LEADS_PER_RUN || 25) + ' per run');
  console.log('──────────────────────────────────────────────────');
  console.log('  node index.js --test   verify connections');
  console.log('  node index.js --run    run once immediately');
  console.log('  Ctrl+C                 stop the scheduler');
  console.log('══════════════════════════════════════════════════\n');

  // Runs at 7:00 AM Eastern every day.
  // node-cron handles DST transitions automatically with the timezone option.
  cron.schedule(
    '0 7 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] Scheduled run triggered…`);
      await runWorkflow();
    },
    { timezone: 'America/New_York' }
  );

  console.log('Scheduler is active. Waiting for 7:00 AM ET…\n');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
