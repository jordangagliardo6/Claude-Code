/**
 * index.js — Entry point with the 7am Eastern cron scheduler.
 *
 * Run with: npm start
 * This process must stay alive to fire the daily schedule.
 * Use a process manager like PM2 for production: pm2 start src/index.js --name hvac-leads
 */

require('dotenv').config();

const cron = require('node-cron');
const { run } = require('./workflow');
const log     = require('./logger');
const config  = require('./config');

log.info('HVAC Lead Gen scheduler started.');
log.info(`Next run: every day at 7:00 AM Eastern (${config.schedule.timezone}).`);

// Validates env vars early so you know about config problems at startup,
// not at 7am when the first run silently fails.
validateEnv();

cron.schedule(config.schedule.cron, async () => {
  log.info('Cron triggered — starting scheduled run.');
  try {
    await run();
  } catch (err) {
    log.error(`Unhandled error in scheduled run: ${err.message}`);
  }
}, {
  scheduled: true,
  timezone: config.schedule.timezone,
});

function validateEnv() {
  const missing = [];
  if (!process.env.APOLLO_API_KEY)        missing.push('APOLLO_API_KEY');
  if (!process.env.GOOGLE_SPREADSHEET_ID) missing.push('GOOGLE_SPREADSHEET_ID');

  if (missing.length) {
    log.warn(`Missing env vars: ${missing.join(', ')} — runs will fail until set.`);
  } else {
    log.info('Environment variables look good.');
  }
}
