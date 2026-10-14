/**
 * index.js — Scheduler entry point
 *
 * Usage:
 *   node index.js                    Start the scheduler (runs at 7am ET daily)
 *   node index.js --check-connections  Verify both API connections before going live
 *   node index.js --run-now          Execute the workflow immediately (then exit)
 *   npm run check                    Alias for --check-connections
 *   npm run run-now                  Alias for --run-now
 */

require('dotenv').config();

const cron              = require('node-cron');
const { runWorkflow, checkConnections } = require('./workflow');

const args = process.argv.slice(2);

// ── --check-connections ───────────────────────────────────────────────────────
if (args.includes('--check-connections')) {
  checkConnections()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => { console.error(err.message); process.exit(1); });
  return; // stop here — don't register the cron job
}

// ── --run-now ─────────────────────────────────────────────────────────────────
if (args.includes('--run-now')) {
  console.log('Manual run triggered. Running now…\n');
  runWorkflow()
    .then(() => process.exit(0))
    .catch(err => { console.error(err.message); process.exit(1); });
  return;
}

// ── Scheduled mode ────────────────────────────────────────────────────────────
//
// Cron expression: "0 7 * * *"
//   ┌── minute  (0)
//   │ ┌── hour   (7 = 7am)
//   │ │ ┌── day of month (* = every day)
//   │ │ │ ┌── month (* = every month)
//   │ │ │ │ ┌── day of week (* = every day)
//   0 7 * * *
//
// timezone: 'America/New_York' handles EST/EDT automatically.

cron.schedule(
  '0 7 * * *',
  () => {
    console.log(`\n[${new Date().toISOString()}] Scheduled trigger fired.`);
    runWorkflow();
  },
  { scheduled: true, timezone: 'America/New_York' }
);

console.log('═══════════════════════════════════════════════════');
console.log(' Apollo HVAC Lead Gen — Scheduler Active');
console.log('═══════════════════════════════════════════════════');
console.log(' Schedule : Every day at 7:00 AM Eastern Time');
console.log(` Max leads: ${process.env.MAX_LEADS_PER_RUN || 25} per run`);
console.log('');
console.log(' Commands:');
console.log('   node index.js --check-connections  Verify APIs');
console.log('   node index.js --run-now            Run immediately');
console.log('═══════════════════════════════════════════════════\n');
