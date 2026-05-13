/**
 * Entry point — handles CLI flags and starts the cron scheduler.
 *
 * Usage:
 *   node index.js                  Start the 7am scheduler and keep running
 *   node index.js --test-connection  Verify Apollo + Sheets credentials, then exit
 *   node index.js --run-now          Run one workflow cycle immediately, then exit
 */

require('dotenv').config();

const cron     = require('node-cron');
const logger   = require('./src/logger');
const { runWorkflow } = require('./src/workflow');

// ── Lazy imports for connection test (avoids loading googleapis at startup) ──

async function testConnections() {
  logger.info('Testing connections…');

  const { testConnection: apolloTest }  = require('./src/apollo');
  const { testConnection: sheetsTest }  = require('./src/sheets');

  let allOk = true;

  try {
    await apolloTest();
    logger.info('  ✓  Apollo.io — connected');
  } catch (err) {
    logger.error(`  ✗  Apollo.io — FAILED: ${err.message}`);
    allOk = false;
  }

  try {
    await sheetsTest();
    logger.info('  ✓  Google Sheets — connected');
  } catch (err) {
    logger.error(`  ✗  Google Sheets — FAILED: ${err.message}`);
    allOk = false;
  }

  return allOk;
}

// ── CLI flag handling ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test-connection')) {
    const ok = await testConnections();
    process.exit(ok ? 0 : 1);
  }

  if (args.includes('--run-now')) {
    logger.info('--run-now flag detected — running workflow immediately…');
    const result = await runWorkflow();
    process.exit(result.success ? 0 : 1);
  }

  // ── Default: start scheduler ──────────────────────────────────────────────

  // Run a connection test at startup so problems surface before the first
  // scheduled run at 7am.
  logger.info('Starting HVAC Lead Gen Workflow service…');
  const ok = await testConnections();
  if (!ok) {
    logger.error('One or more connections failed. Fix the errors above and restart.');
    process.exit(1);
  }
  logger.info('All connections verified. Scheduler starting…');

  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *'; // default 7:00 AM
  const timezone = process.env.TIMEZONE       || 'America/New_York';

  if (!cron.validate(schedule)) {
    logger.error(`Invalid cron expression: "${schedule}". Check CRON_SCHEDULE in .env`);
    process.exit(1);
  }

  logger.info(`Cron schedule : "${schedule}" (${timezone})`);
  logger.info('Next run      : see https://crontab.guru/#' + schedule.replace(/ /g, '_'));
  logger.info('Press Ctrl+C to stop.\n');

  cron.schedule(schedule, async () => {
    try {
      await runWorkflow();
    } catch (err) {
      // Catch anything runWorkflow didn't handle so the process stays alive
      logger.error(`Unhandled error in scheduled run: ${err.message}`);
    }
  }, { timezone });
}

main().catch(err => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
