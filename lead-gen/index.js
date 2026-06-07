/**
 * HVAC Lead Gen — Scheduler
 *
 * Runs automatically every day at 7:00 AM Eastern Time.
 * Keep this process alive with a process manager (pm2, systemd, etc.)
 * so it survives server restarts.
 *
 * Start:    node index.js
 * One-shot: node run-now.js   (test without waiting for 7am)
 */

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./src/runner');

const SCHEDULE = '0 7 * * *';    // 7:00 AM every day
const TIMEZONE = 'America/New_York';

// ── Startup banner ────────────────────────────────────────────────
const nextRun = getNextRun();
console.log('');
console.log('  HVAC Lead Gen — Scheduler');
console.log('  ─────────────────────────────────────────────────');
console.log(`  Schedule  : ${SCHEDULE}  (${TIMEZONE})`);
console.log(`  Next run  : ${nextRun}`);
console.log(`  Max leads : ${process.env.MAX_LEADS_PER_RUN || 25} per day`);
console.log(`  Sheet tab : ${process.env.GOOGLE_SHEET_TAB || 'Leads'}`);
console.log('  ─────────────────────────────────────────────────');
console.log('  Tip: run  node run-now.js  to test immediately.');
console.log('');

// ── Schedule the daily job ────────────────────────────────────────
cron.schedule(
  SCHEDULE,
  async () => {
    try {
      await run();
    } catch (err) {
      // run() sends its own notifications — just prevent an unhandled rejection
      console.error('[Scheduler] Run ended with error:', err.message);
    }
  },
  { timezone: TIMEZONE }
);

console.log('Scheduler is active. Press Ctrl+C to stop.\n');

// ── Helpers ───────────────────────────────────────────────────────
function getNextRun() {
  const now = new Date();
  const next = new Date(
    now.toLocaleString('en-US', { timeZone: TIMEZONE })
  );
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', {
    timeZone: TIMEZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  });
}
