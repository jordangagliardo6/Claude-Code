// Entry point
// Usage:
//   node index.js            → start the daily 7am scheduler (keep process running)
//   node index.js --run-once → run the workflow immediately, then exit
//   node index.js --test     → verify Apollo + Google Sheets connections, then exit

require('dotenv').config();

const logger    = require('./src/logger');
const apollo    = require('./src/apollo');
const sheets    = require('./src/sheets');
const workflow  = require('./src/workflow');
const scheduler = require('./src/scheduler');

const arg = process.argv[2];

async function main() {
  if (arg === '--test') {
    // ── Connection test ─────────────────────────────────────────────────────
    logger.info('Running connection tests...');
    let ok = true;

    try {
      await apollo.testConnection();
    } catch (err) {
      logger.error(`Apollo connection FAILED: ${err.message}`);
      ok = false;
    }

    try {
      await sheets.testConnection();
    } catch (err) {
      logger.error(`Google Sheets connection FAILED: ${err.message}`);
      ok = false;
    }

    if (ok) {
      logger.success('All connections OK — you are ready to run the workflow.');
    } else {
      logger.error('One or more connections failed. Fix the errors above, then retest.');
      process.exit(1);
    }

  } else if (arg === '--run-once') {
    // ── One-shot run ────────────────────────────────────────────────────────
    await workflow.run();
    process.exit(0);

  } else {
    // ── Scheduler mode (default) ────────────────────────────────────────────
    logger.info('Starting HVAC lead gen scheduler...');
    logger.info('Press Ctrl+C to stop.');
    scheduler.start();
    // Process stays alive; cron fires each morning at 7am ET.
  }
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
