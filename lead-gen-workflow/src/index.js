/**
 * Entry point — verifies connections and starts the cron scheduler.
 *
 * Usage:
 *   node src/index.js                 → verify + start scheduler (runs daily at 7 AM ET)
 *   node src/index.js --run-now       → verify + run once immediately, then keep scheduling
 *   node src/index.js --verify-only   → verify connections only, then exit
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { testConnection: testApollo } = require('./apollo');
const { testConnection: testSheets } = require('./sheets');
const { runWorkflow } = require('./workflow');

// ── Verification ──────────────────────────────────────────────────────────────

async function verifySetup() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   HVAC Lead Gen — Connection Verification                ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let allGood = true;

  // 1. Apollo.io
  process.stdout.write('  [1/2] Apollo.io ... ');
  try {
    const totalEntries = await testApollo();
    console.log(`✅  connected (API total entries visible: ${totalEntries})`);
  } catch (err) {
    console.log(`❌  FAILED\n        → ${err.message}`);
    allGood = false;
  }

  // 2. Google Sheets
  process.stdout.write('  [2/2] Google Sheets ... ');
  try {
    const sheetTitle = await testSheets();
    console.log(`✅  connected — spreadsheet: "${sheetTitle}"`);
  } catch (err) {
    console.log(`❌  FAILED\n        → ${err.message}`);
    allGood = false;
  }

  console.log('');

  if (!allGood) {
    console.error('  One or more connections failed. Fix the errors above and re-run.\n');
    process.exit(1);
  }

  return true;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function startScheduler() {
  // Cron expression: minute=0, hour=7 → 7:00 AM every day
  // node-cron respects the timezone option natively (no server TZ change needed)
  const job = cron.schedule(
    '0 7 * * *',
    async () => {
      await runWorkflow();
    },
    { timezone: 'America/New_York' }
  );

  console.log('  Scheduler started:');
  console.log('    ↳ Runs every day at 7:00 AM Eastern Time');
  console.log(`    ↳ Max leads per run : ${process.env.MAX_LEADS_PER_RUN || '25'}`);
  console.log(`    ↳ Target spreadsheet: ${process.env.GOOGLE_SPREADSHEET_ID}`);
  console.log('\n  Press Ctrl+C to stop.\n');

  return job;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify-only');
  const runNow = args.includes('--run-now');

  // Always verify before doing anything else
  await verifySetup();

  if (verifyOnly) {
    console.log('  --verify-only flag set. Exiting.\n');
    process.exit(0);
  }

  // Start the daily cron
  startScheduler();

  // Optionally run once immediately (useful for testing)
  if (runNow) {
    console.log('  --run-now flag detected — running workflow immediately...\n');
    await runWorkflow();
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
