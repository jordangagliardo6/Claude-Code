'use strict';

/**
 * index.js — Scheduler entry point
 *
 * Runs the lead generation workflow automatically every morning at 7:00 AM ET.
 * Start this process with:  node index.js   (or  npm start)
 * Keep it running using PM2, screen, or a systemd service so it survives reboots.
 *
 * To trigger a manual run without the scheduler, use:  node run-once.js
 */

require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const { log, sendErrorEmail } = require('./src/notify');

// 7:00 AM every day, Eastern Time
const SCHEDULE = '0 7 * * *';
const TIMEZONE = 'America/New_York';

log('Scheduler started. Workflow will run every day at 7:00 AM ET.');
log(`Next run: ${getNextRunTime()}`);

cron.schedule(SCHEDULE, async () => {
  log('\n--- Scheduled run triggered ---');
  try {
    const result = await runWorkflow();
    log(`Run summary: added=${result.added}, searched=${result.searched}, dupes=${result.skippedDupes}, no-phone=${result.skippedNoPhone}`);
  } catch (err) {
    const msg = err.message || String(err);
    log(`ERROR during scheduled run: ${msg}`);

    // Identify the most likely cause to help with manual diagnosis
    const detail = diagnoseError(err);
    await sendErrorEmail('Scheduled run failed', `${msg}\n\n${detail}`);
  }
}, { timezone: TIMEZONE });

/**
 * Describe the most likely cause of a caught error.
 *
 * @param {Error} err
 * @returns {string}
 */
function diagnoseError(err) {
  const msg = (err.message || '').toLowerCase();
  const status = err.response?.status;

  if (status === 401 || msg.includes('unauthorized') || msg.includes('api_key')) {
    return 'Likely cause: invalid or missing APOLLO_API_KEY. Check your .env file.';
  }
  if (status === 403 || msg.includes('inaccessible') || msg.includes('plan')) {
    return 'Likely cause: Apollo plan does not include this API endpoint. Upgrade to Basic ($49/mo) or higher.';
  }
  if (status === 429 || msg.includes('rate limit')) {
    return 'Likely cause: Apollo rate limit hit. The next scheduled run should succeed automatically.';
  }
  if (msg.includes('google') || msg.includes('sheets') || msg.includes('spreadsheet')) {
    return 'Likely cause: Google Sheets write failed. Check credentials.json and that the sheet is shared with the service account.';
  }
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network')) {
    return 'Likely cause: Network error. Check internet connection on the machine running this script.';
  }
  return 'Check run.log for the full stack trace.';
}

/**
 * Calculate and display when the next scheduled run will fire.
 *
 * @returns {string}
 */
function getNextRunTime() {
  const now = new Date();
  const next = new Date();
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', { timeZone: TIMEZONE, dateStyle: 'full', timeStyle: 'short' });
}
