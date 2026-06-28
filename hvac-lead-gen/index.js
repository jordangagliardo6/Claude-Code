/**
 * index.js — Scheduler entry point
 *
 * Runs the HVAC lead generation workflow every morning at 7:00 AM Eastern.
 *
 * Usage:
 *   node index.js            → Start the scheduler (keeps running)
 *   node index.js --run-now  → Execute one run immediately and exit
 *
 * Environment: configure via .env (copy .env.example → .env)
 */

require('dotenv').config();

const cron = require('node-cron');
const { runLeadGeneration } = require('./src/leadgen');
const { sendErrorNotification } = require('./src/notify');

// ── Configuration ──────────────────────────────────────────────────────────

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *'; // 7:00 AM daily
const TIMEZONE = 'America/New_York';                              // Eastern Time

// ── Startup validation ─────────────────────────────────────────────────────

function validateEnv() {
  const required = {
    APOLLO_API_KEY:         'Apollo.io API key',
    GOOGLE_SPREADSHEET_ID:  'Google Sheets spreadsheet ID',
  };

  const missing = Object.entries(required)
    .filter(([key]) => !process.env[key])
    .map(([key, label]) => `  ${key}  (${label})`);

  if (missing.length > 0) {
    console.error('\n[Startup] ❌ Missing required environment variables:\n');
    missing.forEach(m => console.error(m));
    console.error('\nCopy .env.example → .env and fill in the values, then try again.\n');
    process.exit(1);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  HVAC Lead Generation — SW Michigan');
  console.log('═══════════════════════════════════════════════════\n');

  validateEnv();

  // ── One-shot mode: --run-now flag ──────────────────────
  if (process.argv.includes('--run-now')) {
    console.log('[Startup] --run-now flag detected. Running immediately...\n');
    try {
      const result = await runLeadGeneration();
      console.log(
        `\n[Startup] Done. Added: ${result.added} | Skipped: ${result.skipped} | API total: ${result.total}`
      );
    } catch (err) {
      console.error('[Startup] Run failed:', err.message);
      process.exit(1);
    }
    return; // exit after one-shot run
  }

  // ── Scheduled mode ─────────────────────────────────────
  console.log(`[Scheduler] Schedule: ${CRON_SCHEDULE} (${TIMEZONE})`);
  console.log('[Scheduler] Next run: every morning at 7:00 AM Eastern Time');
  console.log('[Scheduler] Press Ctrl+C to stop.\n');

  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      try {
        const result = await runLeadGeneration();
        console.log(
          `[Scheduler] Run complete — Added: ${result.added} | Skipped: ${result.skipped}`
        );
      } catch (err) {
        // runLeadGeneration already sent an alert for known errors;
        // this catches anything unexpected that bubbled up.
        await sendErrorNotification(
          'Scheduled Run Crashed',
          `The 7am lead generation run threw an unhandled error.\n\n` +
            `Error: ${err.message}\n\nStack:\n${err.stack}`
        );
      }
    },
    { timezone: TIMEZONE }
  );
}

main();
