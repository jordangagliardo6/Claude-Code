// ─────────────────────────────────────────────────────────────────────────────
// index.js — Scheduler entry point
// Starts a cron job that runs the lead generation workflow every morning at
// 7:00 AM Eastern Time. Run `npm start` to keep this process alive.
//
// First time? Run `npm run setup-check` BEFORE starting the scheduler to
// confirm both Apollo.io and Google Sheets are connected correctly.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const cron             = require('node-cron');
const { runWorkflow }  = require('./workflow');

const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *'; // default: 7:00 AM daily
const TZ       = 'America/New_York';

// ── Startup banner ─────────────────────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  HVAC Lead Gen — Scheduler                                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`  Cron schedule : ${SCHEDULE}`);
console.log(`  Timezone      : ${TZ}`);
console.log(`  Max leads/run : ${require('./config').maxLeadsPerRun}`);
console.log(`  Target cities : ${require('./config').cities.length}`);
console.log('');
console.log('  Next run      : Tomorrow at 7:00 AM Eastern Time');
console.log('  To run now    : npm run run-once');
console.log('  To verify     : npm run setup-check');
console.log('');

// ── Schedule ───────────────────────────────────────────────────────────────────

if (!cron.validate(SCHEDULE)) {
  console.error(`[Scheduler] Invalid cron expression: "${SCHEDULE}"`);
  console.error('  Update CRON_SCHEDULE in your .env file and restart.');
  process.exit(1);
}

cron.schedule(
  SCHEDULE,
  () => {
    console.log('[Scheduler] Cron fired — starting workflow...');
    runWorkflow().catch((err) => {
      console.error('[Scheduler] Uncaught error in workflow:', err.message);
    });
  },
  { timezone: TZ }
);

console.log('[Scheduler] Active — waiting for next scheduled run.');
console.log('[Scheduler] Keep this process running (e.g. with pm2, screen, or systemd).\n');

// ── Graceful shutdown ──────────────────────────────────────────────────────────

process.on('SIGINT',  () => { console.log('\n[Scheduler] Shutting down (SIGINT).  Goodbye.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[Scheduler] Shutting down (SIGTERM). Goodbye.'); process.exit(0); });
