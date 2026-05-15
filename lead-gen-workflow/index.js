/**
 * Entry point
 *
 * Usage:
 *   node index.js            — start the scheduler (runs every day at 7 AM ET)
 *   node index.js --once     — run the workflow immediately and exit
 *   npm run setup            — test connections before first scheduled run
 */

require('dotenv').config();

const { runWorkflow } = require('./src/workflow');
const { startScheduler } = require('./src/scheduler');
const logger = require('./src/logger');

const runOnce = process.argv.includes('--once');

(async () => {
  if (runOnce) {
    // ── One-shot mode ──────────────────────────────────────────────────────
    logger.info('Running workflow once (--once flag detected)');
    const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
    const result = await runWorkflow(maxLeads);
    if (!result.success) {
      logger.error(`Workflow failed: ${result.error}`);
      process.exit(1);
    }
    process.exit(0);
  } else {
    // ── Scheduled mode ─────────────────────────────────────────────────────
    logger.info('Starting lead-gen scheduler. Press Ctrl+C to stop.');
    startScheduler();

    // Keep the process alive
    process.on('SIGINT', () => {
      logger.info('Scheduler stopped by user (SIGINT)');
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      logger.info('Scheduler stopped (SIGTERM)');
      process.exit(0);
    });
  }
})();
