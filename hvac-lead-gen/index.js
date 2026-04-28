require('dotenv').config();

const cron    = require('node-cron');
const logger  = require('./src/logger');
const { runWorkflow }              = require('./src/workflow');
const { testConnection: testApollo } = require('./src/apollo');
const { testConnection: testSheets } = require('./src/sheets');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const args      = process.argv.slice(2);

async function main() {

  // ── Flag: --test ─────────────────────────────────────────────────────────────
  // Verifies both APIs are reachable before committing to a scheduled run.
  // Usage: npm run test-connection
  if (args.includes('--test')) {
    logger.info('════════════════════════════════════════');
    logger.info('  Connection Test Mode');
    logger.info('════════════════════════════════════════');

    const [apolloOk, sheetsOk] = await Promise.all([testApollo(), testSheets()]);

    logger.info('────────────────────────────────────────');
    logger.info(`Apollo.io     : ${apolloOk ? '✅ CONNECTED' : '❌ FAILED'}`);
    logger.info(`Google Sheets : ${sheetsOk ? '✅ CONNECTED' : '❌ FAILED'}`);
    logger.info('────────────────────────────────────────');

    if (apolloOk && sheetsOk) {
      logger.info('All systems go! You can now:');
      logger.info('  node index.js --run-now   → run once immediately');
      logger.info('  node index.js             → start the 7 AM daily scheduler');
    } else {
      logger.error('Fix the failing connection(s) above, then re-run the test.');
      process.exit(1);
    }
    return;
  }

  // ── Flag: --run-now ──────────────────────────────────────────────────────────
  // Executes the workflow immediately (handy for testing the full pipeline).
  // Usage: npm run run-now
  if (args.includes('--run-now')) {
    logger.info('Manual run triggered via --run-now');
    await runWorkflow(MAX_LEADS);
    return;
  }

  // ── Default: start the daily scheduler ───────────────────────────────────────
  // Runs at 07:00 America/New_York every day.
  // node-cron handles DST automatically when a timezone is specified.
  logger.info('════════════════════════════════════════');
  logger.info('  HVAC Lead Gen — Scheduler Starting');
  logger.info('════════════════════════════════════════');
  logger.info(`Schedule      : 7:00 AM Eastern Time, daily`);
  logger.info(`Max per run   : ${MAX_LEADS} leads`);
  logger.info(`Log file      : logs/workflow.log`);
  logger.info('Press Ctrl+C to stop.');
  logger.info('════════════════════════════════════════');

  cron.schedule(
    '0 7 * * *',
    async () => {
      logger.info('Cron fired — beginning scheduled lead generation run');
      await runWorkflow(MAX_LEADS);
    },
    { timezone: 'America/New_York' }
  );
}

main().catch(err => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
