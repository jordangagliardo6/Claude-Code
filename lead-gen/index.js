'use strict';

// Load .env before anything else
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const cron = require('node-cron');
const { runWorkflow, verifySetup } = require('./workflow');

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || 'America/New_York';

const args = process.argv.slice(2);

async function main() {
  // ── npm run verify ───────────────────────────────────────────────────────────
  if (args.includes('--verify')) {
    await verifySetup();
    return;
  }

  // ── npm run run-now ──────────────────────────────────────────────────────────
  if (args.includes('--run-now')) {
    console.log('[Scheduler] Manual run triggered...');
    await runWorkflow();
    return;
  }

  // ── npm start (scheduler mode) ───────────────────────────────────────────────
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[Scheduler] Invalid cron expression: "${CRON_SCHEDULE}"`);
    process.exit(1);
  }

  console.log('─'.repeat(60));
  console.log('  HVAC Lead Gen Scheduler — Started');
  console.log(`  Schedule:  ${CRON_SCHEDULE} (${CRON_TIMEZONE})`);
  console.log(`  Max leads per run: ${process.env.MAX_LEADS_PER_RUN || 25}`);
  console.log('─'.repeat(60));
  console.log('  Use Ctrl+C to stop. Runs silently until scheduled time.');
  console.log('  To run immediately: npm run run-now');
  console.log('─'.repeat(60) + '\n');

  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      console.log(`[Scheduler] Cron fired at ${new Date().toLocaleString('en-US', { timeZone: CRON_TIMEZONE })} ET`);
      try {
        await runWorkflow();
      } catch (err) {
        // Belt-and-suspenders: workflow.js should catch its own errors,
        // but this ensures the scheduler never crashes.
        console.error('[Scheduler] Unhandled error in workflow:', err.message);
      }
    },
    { timezone: CRON_TIMEZONE }
  );
}

main().catch((err) => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
