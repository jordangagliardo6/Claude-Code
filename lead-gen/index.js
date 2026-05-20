require('dotenv').config();
const cron = require('node-cron');
const { runLeadGeneration } = require('./src/workflow');
const { testConnection } = require('./src/sheets');
const logger = require('./src/logger');

const args = process.argv.slice(2);
const RUN_NOW  = args.includes('--now');
const RUN_TEST = args.includes('--test');

// ── Connection test ────────────────────────────────────────────────────────────
async function runConnectionTest() {
  logger.info('=== Connection Test ===');

  // Test Apollo
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey || apolloKey === 'your_apollo_api_key_here') {
    logger.error('Apollo: APOLLO_API_KEY is not set or is still the placeholder value.');
    process.exit(1);
  }
  logger.success(`Apollo: API key loaded (${apolloKey.slice(0, 6)}...${apolloKey.slice(-4)})`);

  // Test Google Sheets
  try {
    const title = await testConnection();
    logger.success(`Google Sheets: Connected — spreadsheet title is "${title}"`);
  } catch (err) {
    logger.error('Google Sheets: Connection failed', err);
    logger.error('Check GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_KEY_PATH, and sheet sharing settings.');
    process.exit(1);
  }

  logger.success('All connections OK. You are ready to run the workflow.');
  logger.info('Start the scheduler with:  node index.js');
  logger.info('Trigger a manual run with: node index.js --now');
}

// ── Manual / immediate run ─────────────────────────────────────────────────────
async function runManual() {
  try {
    await runLeadGeneration();
    process.exit(0);
  } catch (err) {
    logger.error('Manual run failed — see log for details.');
    process.exit(1);
  }
}

// ── Scheduled run (7am Eastern daily) ─────────────────────────────────────────
function startScheduler() {
  // node-cron uses: second(opt) minute hour day month weekday
  // '0 7 * * *' = top of the 7th hour, every day
  const schedule = '0 7 * * *';
  const timezone = 'America/New_York';

  logger.info(`Scheduler started — next run at 7:00 AM Eastern (${timezone}).`);
  logger.info('Leave this process running. Press Ctrl+C to stop.');
  logger.separator();

  cron.schedule(
    schedule,
    async () => {
      logger.info('Scheduled trigger fired.');
      try {
        await runLeadGeneration();
      } catch (err) {
        // Error already logged inside runLeadGeneration; nothing more to do here
        // except note it in the scheduler context.
        logger.error('Scheduled run ended with an error — check logs/lead-gen.log');
      }
    },
    { timezone }
  );
}

// ── Entry point ────────────────────────────────────────────────────────────────
if (RUN_TEST) {
  runConnectionTest();
} else if (RUN_NOW) {
  logger.info('Manual run triggered via --now flag.');
  runManual();
} else {
  startScheduler();
}
