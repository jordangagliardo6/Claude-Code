/**
 * Entry point — starts the cron scheduler.
 * To run the workflow immediately instead, use: npm run run-once
 * To test connections only, use:               npm run test-connection
 */
const cron = require('node-cron');
const { runWorkflow } = require('./workflow');
const { cron: cronConfig } = require('./config');

const schedule = cronConfig.schedule;

if (!cron.validate(schedule)) {
  console.error(`Invalid cron schedule: "${schedule}"`);
  process.exit(1);
}

console.log(`Scheduler starting. Cron: "${schedule}" (UTC)`);
console.log('Next run:', nextRunTime(schedule));
console.log('Press Ctrl+C to stop.\n');

cron.schedule(schedule, async () => {
  try {
    await runWorkflow();
  } catch (err) {
    // Catch-all — should not normally reach here
    console.error('Unexpected error in workflow:', err);
  }
}, {
  timezone: 'UTC', // Schedule is expressed in UTC; see .env for conversion notes
});

/** Rough human-readable estimate of when the cron will next fire */
function nextRunTime(expr) {
  // node-cron doesn't expose nextDate, so we approximate
  const parts = expr.split(' ');
  if (parts.length === 5) {
    const [min, hr] = parts;
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(parseInt(hr, 10), parseInt(min, 10), 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.toUTCString();
  }
  return '(unknown)';
}
