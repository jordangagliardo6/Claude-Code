/**
 * index.js
 * Entry point — starts the scheduler.
 *
 * The workflow runs once every morning at 7:00 AM Eastern Time.
 * DST is handled automatically by the 'America/New_York' timezone.
 *
 * To run the workflow immediately (without waiting for the cron trigger),
 * use:  npm run run-now
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./workflow');

// ── Startup environment check ─────────────────────────────────────────────────
const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `\nERROR: Missing required environment variable(s): ${missing.join(', ')}\n` +
    `Copy .env.example to .env and fill in the values, then restart.\n`
  );
  process.exit(1);
}

// ── Schedule ──────────────────────────────────────────────────────────────────
// Cron syntax: minute hour day month weekday
// "0 7 * * *" = 7:00 AM every day
const CRON_EXPRESSION = '0 7 * * *';
const TIMEZONE = 'America/New_York';

cron.schedule(
  CRON_EXPRESSION,
  async () => {
    try {
      await runWorkflow();
    } catch (unexpectedErr) {
      // Safety net — runWorkflow handles its own errors, but just in case
      console.error('[FATAL] Unexpected error in runWorkflow:', unexpectedErr);
    }
  },
  { timezone: TIMEZONE }
);

const nextRun = getNextRunDescription();
console.log('\nHVAC Lead Generation Scheduler started.');
console.log(`Schedule  : ${CRON_EXPRESSION} (${TIMEZONE})`);
console.log(`Next run  : ${nextRun}`);
console.log(`Max leads : ${process.env.MAX_LEADS_PER_RUN ?? 25} per run`);
console.log('\nPress Ctrl+C to stop.\n');
console.log('TIP: To run the workflow right now, open a new terminal and run:');
console.log('       npm run run-now\n');

function getNextRunDescription() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(7, 0, 0, 0);
  // If 7am already passed today, schedule for tomorrow
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
