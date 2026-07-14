/**
 * HVAC Lead Generator — Scheduler Entry Point
 *
 * Runs the lead generation workflow every morning at 7:00 AM Eastern.
 * Uses node-cron with America/New_York timezone so DST is handled automatically.
 *
 * Start the scheduler:   npm start   (or: node index.js)
 * Run immediately once:  npm run run-now
 * Test connections only: npm run test-connection
 */

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');

// ── Cron schedule ──────────────────────────────────────────────────────────
// '0 7 * * *' = at 07:00 every day
// timezone: 'America/New_York' = Eastern Time (auto-adjusts for DST)
const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';
const TIMEZONE = 'America/New_York';

// ─────────────────────────────────────────────────────────────────────────────

function nextRunDisplay() {
  // Quick human-readable note about when the next run fires
  return `7:00 AM Eastern (${TIMEZONE})`;
}

cron.schedule(
  SCHEDULE,
  async () => {
    console.log(`\n[${new Date().toISOString()}] Cron triggered — starting scheduled run.`);
    try {
      await runWorkflow();
    } catch {
      // Error already logged and emailed inside runWorkflow — nothing more to do here.
    }
  },
  { scheduled: true, timezone: TIMEZONE }
);

// ─────────────────────────────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║       HVAC Lead Generator — Southwest Michigan       ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');
console.log(`  Scheduler:  ACTIVE`);
console.log(`  Next run:   ${nextRunDisplay()}`);
console.log(`  Schedule:   ${SCHEDULE}  (cron format)`);
console.log('');
console.log('  Commands:');
console.log('    npm run run-now          Run one cycle immediately');
console.log('    npm run test-connection  Verify API + Sheets access');
console.log('');
console.log('  Press Ctrl+C to stop the scheduler.');
console.log('');
