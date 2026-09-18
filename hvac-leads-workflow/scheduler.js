/**
 * Scheduler — runs the HVAC lead workflow every morning at 7:00 AM Eastern.
 *
 * Start with:  node scheduler.js
 * Keep alive:  pm2 start scheduler.js --name hvac-leads
 *              (install pm2: npm install -g pm2)
 *
 * node-cron timezone list: https://momentjs.com/timezone/
 */

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./index');
const { sendErrorEmail } = require('./notify');

// "0 7 * * *" = 7:00 AM every day  |  timezone = America/New_York (Eastern)
const SCHEDULE  = process.env.CRON_SCHEDULE || '0 7 * * *';
const TIMEZONE  = 'America/New_York';

console.log(`HVAC leads scheduler started.`);
console.log(`Schedule: "${SCHEDULE}" in timezone ${TIMEZONE}`);
console.log(`Next run: ${getNextRun()}\n`);

cron.schedule(SCHEDULE, async () => {
  console.log(`\n[CRON] Firing at ${new Date().toISOString()}`);
  try {
    const result = await run();
    console.log(`[CRON] Completed — ${result.added} added, ${result.skipped} skipped`);
  } catch (err) {
    const msg = `Scheduled run failed: ${err.message}`;
    console.error('[CRON] ❌', msg);
    console.error(err.stack);
    await sendErrorEmail(msg).catch(() => {});
  }
}, { timezone: TIMEZONE });

// Graceful shutdown
process.on('SIGINT',  () => { console.log('\nScheduler stopped.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nScheduler stopped.'); process.exit(0); });

function getNextRun() {
  // Quick human-readable estimate (within a day)
  const now = new Date();
  const next = new Date();
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', { timeZone: TIMEZONE, dateStyle: 'full', timeStyle: 'short' });
}
