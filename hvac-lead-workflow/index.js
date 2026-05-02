/**
 * index.js
 *
 * Entry point for the HVAC lead generation workflow.
 *
 * Modes:
 *   node index.js             → starts the daily cron scheduler (7 AM Eastern)
 *   node index.js --run-now   → runs the workflow once immediately, then exits
 */

require('dotenv').config();
const cron = require('node-cron');
const { runLeadWorkflow } = require('./src/leadProcessor');
const { logSuccess, notifyError } = require('./src/notifier');

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *'; // 7:00 AM daily
const TIMEZONE      = 'America/New_York';

// ── Single run ────────────────────────────────────────────────────────────────

async function runOnce() {
  const now = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
  console.log(`\n🚀  Starting HVAC lead workflow  [${now}]`);

  try {
    const summary = await runLeadWorkflow();
    logSuccess(summary);
    return summary;
  } catch (err) {
    // Determine which stage failed based on the error message prefix.
    const stage = err.message?.toLowerCase().includes('apollo')
      ? 'Apollo search'
      : err.message?.toLowerCase().includes('google') || err.message?.toLowerCase().includes('sheets')
      ? 'Google Sheets write'
      : 'workflow';

    await notifyError(err, stage);
    throw err;
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function startScheduler() {
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`❌  Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}". Using default "0 7 * * *".`);
  }

  console.log(`\n⏰  Scheduler started.`);
  console.log(`   Schedule  : ${CRON_SCHEDULE} (${TIMEZONE})`);
  console.log(`   Next run  : ${getNextRunDescription()}`);
  console.log(`   Process   : running — do not close this terminal.\n`);
  console.log('   Tip: run  node index.js --run-now  to test immediately.\n');

  cron.schedule(CRON_SCHEDULE, () => {
    runOnce().catch(() => {
      // Error already logged + emailed by runOnce(); keep the process alive.
    });
  }, { timezone: TIMEZONE });
}

function getNextRunDescription() {
  // Simple human-readable hint (not a full cron parser).
  const parts = CRON_SCHEDULE.split(' ');
  if (parts.length === 5 && parts[0] !== '*' && parts[1] !== '*') {
    const hour   = parseInt(parts[1], 10);
    const minute = parseInt(parts[0], 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const h12    = hour > 12 ? hour - 12 : hour || 12;
    return `${h12}:${String(minute).padStart(2, '0')} ${period} ${TIMEZONE}`;
  }
  return CRON_SCHEDULE;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  runOnce()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  startScheduler();
}
