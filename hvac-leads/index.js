/**
 * Entry point — starts the node-cron scheduler.
 * Run with:  node index.js
 *
 * To do a one-off run without waiting for the schedule:
 *   npm run run-now
 */

require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const config = require('./src/config');

// ── Pre-flight checks ─────────────────────────────────────────────────────────

function validateEnv() {
  const required = {
    APOLLO_API_KEY:         config.apolloApiKey,
    GOOGLE_SPREADSHEET_ID:  config.googleSpreadsheetId,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error(`\n[Startup] ❌ Missing required environment variables:\n`);
    missing.forEach(k => console.error(`   • ${k}`));
    console.error('\nCopy .env.example → .env and fill in the values, then run: node setup.js\n');
    process.exit(1);
  }
}

validateEnv();

// ── Scheduler ─────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║   HVAC Lead Generation — Scheduler Starting      ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log(`  Schedule : ${config.cronSchedule} (America/New_York)`);
console.log(`  Max leads: ${config.maxLeadsPerRun} per run`);
console.log(`  Target   : ${config.targetCities.join(', ')}`);
console.log(`  Sheet ID : ${config.googleSpreadsheetId}\n`);

const job = cron.schedule(config.cronSchedule, async () => {
  console.log(`[Cron] Triggered at ${new Date().toISOString()}`);
  try {
    await runWorkflow();
  } catch (err) {
    // runWorkflow() catches its own errors, but this is a safety net.
    console.error('[Cron] Unhandled error:', err.message);
  }
}, {
  // Always run relative to Eastern time so daylight-saving transitions
  // don't silently shift the 7 AM fire time.
  timezone: 'America/New_York',
  scheduled: true,
});

console.log('✅ Scheduler active. Next run: 7:00 AM Eastern.\n');
console.log('   • One-off run now : npm run run-now');
console.log('   • Stop scheduler  : Ctrl+C\n');

// Keep the process alive.
process.on('SIGINT', () => {
  console.log('\n[Scheduler] Shutting down…');
  job.stop();
  process.exit(0);
});
