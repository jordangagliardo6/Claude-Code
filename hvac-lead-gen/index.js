'use strict';

require('dotenv').config(); // load .env file before anything else

const cron              = require('node-cron');
const { runWorkflow }   = require('./src/workflow');
const { alertError }    = require('./src/notify');
const { CRON_SCHEDULE, CRON_TIMEZONE } = require('./config');

console.log('─'.repeat(60));
console.log('  HVAC Lead Gen — Scheduler Starting');
console.log(`  Schedule : ${CRON_SCHEDULE} (${CRON_TIMEZONE})`);
console.log(`  Next run : ${nextRunTime()}`);
console.log('─'.repeat(60));
console.log('  Run "npm run test-connection" first if this is your initial setup.');
console.log('  Run "npm run run-now" to trigger an immediate run.');
console.log('─'.repeat(60) + '\n');

cron.schedule(
  CRON_SCHEDULE,
  async () => {
    try {
      await runWorkflow();
    } catch (err) {
      // Belt-and-suspenders: workflow.js already catches internally,
      // but guard the scheduler loop itself too.
      await alertError('Unhandled scheduler error', err);
    }
  },
  { timezone: CRON_TIMEZONE }
);

function nextRunTime() {
  // Quick approximation — just show today/tomorrow at 7am ET
  const now = new Date();
  const et  = new Date(now.toLocaleString('en-US', { timeZone: CRON_TIMEZONE }));
  const next = new Date(et);
  next.setHours(7, 0, 0, 0);
  if (next <= et) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', {
    timeZone: CRON_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' ET';
}
