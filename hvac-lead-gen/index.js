'use strict';

require('dotenv').config();
const cron     = require('node-cron');
const logger   = require('./src/logger');
const { runWorkflow } = require('./src/workflow');

// ── Schedule ──────────────────────────────────────────────────────────────────
// "0 7 * * *" = 7:00 AM every day in America/New_York (Eastern).
// To change the time, edit the cron string here.
// Format:  minute  hour  day-of-month  month  day-of-week
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';
const TIMEZONE      = 'America/New_York';

logger.log('HVAC Lead Gen scheduler starting...');
logger.log(`Schedule: "${CRON_SCHEDULE}" (${TIMEZONE})`);
logger.log('Waiting for next scheduled run. Press Ctrl+C to stop.');

cron.schedule(CRON_SCHEDULE, async () => {
  try {
    await runWorkflow();
  } catch (err) {
    // Should not reach here — runWorkflow handles its own errors — but catch
    // as a last-resort safety net so the cron process stays alive.
    logger.error(`Unhandled error in workflow: ${err.message}`);
  }
}, { timezone: TIMEZONE });
