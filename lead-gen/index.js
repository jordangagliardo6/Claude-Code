'use strict';

require('dotenv').config();
const cron = require('node-cron');
const logger = require('./src/logger');
const { runWorkflow } = require('./src/workflow');

const schedule = process.env.CRON_SCHEDULE || '0 7 * * *'; // 7:00am every day

logger.info('Lead-gen scheduler starting…');
logger.info(`Cron schedule: "${schedule}" (America/New_York)`);
logger.info('Next run: ' + getNextRunDescription(schedule));

cron.schedule(
  schedule,
  async () => {
    try {
      await runWorkflow();
    } catch (err) {
      // Defensive catch — runWorkflow() already handles its own errors,
      // but this ensures an uncaught exception never silently kills the process.
      logger.error('Unhandled error in workflow', err);
    }
  },
  {
    timezone: 'America/New_York',
  }
);

logger.info('Scheduler is running. Press Ctrl+C to stop.');

// ─────────────────────────────────────────────────────────────────────────────
// Compute a human-readable description of the next cron fire time.
// Kept simple — used only for the startup log line.
// ─────────────────────────────────────────────────────────────────────────────
function getNextRunDescription(cronExpr) {
  try {
    const parts = cronExpr.split(' ');
    if (parts.length === 5) {
      const [minute, hour] = parts;
      if (!isNaN(Number(minute)) && !isNaN(Number(hour))) {
        const h = Number(hour);
        const m = Number(minute);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const mm = String(m).padStart(2, '0');
        return `${h12}:${mm} ${ampm} Eastern daily`;
      }
    }
  } catch (_) {}
  return cronExpr;
}
