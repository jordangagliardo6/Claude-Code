/**
 * HVAC Lead Generation — Scheduled Entry Point
 *
 * Starts a node-cron job that fires every morning at 7am Eastern.
 * Edit CRON_SCHEDULE in .env to change the time.
 *
 * Usage:
 *   node index.js
 */

require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/run');

// Default: 7am EST = 12:00 UTC  |  7am EDT = 11:00 UTC
// Override in .env with CRON_SCHEDULE (standard 5-field cron syntax)
const schedule = process.env.CRON_SCHEDULE || '0 12 * * *';

if (!cron.validate(schedule)) {
  console.error(`[Scheduler] Invalid CRON_SCHEDULE value: "${schedule}"`);
  console.error('  Example valid value: "0 12 * * *" (daily at 12:00 UTC = 7am EST)');
  process.exit(1);
}

console.log(`[Scheduler] HVAC Lead Workflow started.`);
console.log(`[Scheduler] Schedule: "${schedule}" (UTC)`);
console.log(`[Scheduler] Next run: ${getNextRun(schedule)}`);
console.log(`[Scheduler] Waiting for next scheduled run. Press Ctrl+C to stop.\n`);

cron.schedule(schedule, async () => {
  try {
    await runWorkflow();
  } catch (err) {
    // Belt-and-suspenders: runWorkflow handles its own errors, but catch anything unexpected
    console.error('[Scheduler] Unexpected error during run:', err.message);
  }
}, {
  timezone: 'UTC', // cron times are always UTC; the schedule above is already converted
});

// ── Helper ──────────────────────────────────────────────────────────────────

function getNextRun(cronExpression) {
  // Simple next-run display using node-cron's internal schedule
  // (avoids a separate dependency)
  try {
    const task = cron.schedule(cronExpression, () => {}, { scheduled: false });
    // node-cron doesn't expose next-run natively, so we just show the expression
    task.destroy();
  } catch (_) { /* ignore */ }
  return `(calculated from "${cronExpression}" in UTC)`;
}
