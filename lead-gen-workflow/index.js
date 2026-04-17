/**
 * Lead Generation Workflow — Entry Point
 *
 * Usage:
 *   node index.js                  Start the scheduler (7am ET daily)
 *   node index.js --test           Test API connections without pulling leads
 *   node index.js --run-now        Run the workflow immediately, then start scheduler
 */

require('dotenv').config();
const logger           = require('./src/logger');
const { testConnection: testApollo }  = require('./src/apollo');
const { testConnection: testSheets }  = require('./src/sheets');
const { runWorkflow }  = require('./src/workflow');
const { startScheduler } = require('./src/scheduler');

const args = process.argv.slice(2);

async function main() {
  logger.info('Lead Gen Workflow starting...');

  // ── Connection test mode ──────────────────────────────────────────────────
  if (args.includes('--test')) {
    logger.info('Running connection tests...');
    let ok = true;

    try {
      await testApollo();
    } catch (err) {
      logger.error(`Apollo.io: FAILED — ${err.message}`);
      ok = false;
    }

    try {
      await testSheets();
    } catch (err) {
      logger.error(`Google Sheets: FAILED — ${err.message}`);
      ok = false;
    }

    if (ok) {
      logger.info('All connections OK. You are ready to start the scheduler.');
      logger.info('Run: node index.js');
    } else {
      logger.error('One or more connections failed. Fix the errors above before starting.');
      process.exit(1);
    }
    return;
  }

  // ── Run immediately (optional), then start scheduler ─────────────────────
  if (args.includes('--run-now')) {
    logger.info('--run-now flag detected: executing workflow immediately...');
    try {
      await runWorkflow();
    } catch (err) {
      logger.error(`Immediate run failed: ${err.message}`);
      // Continue to start the scheduler even if this run failed
    }
  }

  // ── Start the daily cron scheduler ───────────────────────────────────────
  startScheduler(runWorkflow);
  logger.info('Scheduler is running. Press Ctrl+C to stop.');
}

main().catch(err => {
  logger.error(`Unhandled startup error: ${err.message}`);
  process.exit(1);
});
