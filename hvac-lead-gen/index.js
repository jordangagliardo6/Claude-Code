/**
 * index.js — Entry point.
 *
 * Usage:
 *   node index.js                   Start the daily 7 AM ET scheduler
 *   node index.js --test-connection Test Apollo + Google Sheets, then exit
 *   node index.js --run-now         Run one batch immediately, then exit
 *
 * Or via npm scripts:
 *   npm start              (same as node index.js)
 *   npm run test-connection
 *   npm run run-now
 */

require('dotenv').config();

const cron     = require('node-cron');
const config   = require('./src/config');
const apollo   = require('./src/apollo');
const sheets   = require('./src/sheets');
const { runLeadGenWorkflow } = require('./src/workflow');

const args = new Set(process.argv.slice(2));

// ─────────────────────────────────────────────────────────────────────────────
// Mode: --test-connection
// ─────────────────────────────────────────────────────────────────────────────
async function runConnectionTest() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  HVAC Lead Generator — Connection Test       ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  let allPassed = true;

  // ── 1. Apollo.io ──────────────────────────────────────────────
  process.stdout.write('1. Apollo.io API ... ');
  try {
    const result = await apollo.testApolloConnection();
    console.log(`✓  Connected (${result.totalAvailable} contacts available for current filters)`);
  } catch (err) {
    console.log(`✗  FAILED\n   ${err.message}`);
    allPassed = false;
  }

  // ── 2. Google Sheets ──────────────────────────────────────────
  process.stdout.write('2. Google Sheets ... ');
  try {
    const result = await sheets.testSheetsConnection();
    console.log(`✓  Connected`);
    console.log(`   Spreadsheet : "${result.title}"`);
    console.log(`   Existing leads in sheet : ${result.existingLeads}`);
  } catch (err) {
    console.log(`✗  FAILED\n   ${err.message}`);
    allPassed = false;
  }

  console.log('');

  if (allPassed) {
    console.log('✓  All connections OK — ready to run.');
    console.log('');
    console.log('  Start the scheduler : npm start');
    console.log('  Run one batch now   : npm run run-now');
  } else {
    console.log('✗  One or more connections failed.');
    console.log('   Fix the errors above, then re-run this test.');
    process.exitCode = 1;
  }

  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode: --run-now
// ─────────────────────────────────────────────────────────────────────────────
async function runOnce() {
  console.log('Running one lead generation batch now (manual trigger)...');
  await runLeadGenWorkflow();
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode: default — start the scheduler
// ─────────────────────────────────────────────────────────────────────────────
function startScheduler() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  HVAC Lead Generator — Scheduler             ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Schedule : daily at 7:00 AM Eastern Time`);
  console.log(`  Cities   : ${config.targetCities.length} SW Michigan cities`);
  console.log(`  Max leads: ${config.maxLeadsPerRun} per run`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');

  cron.schedule(
    config.cronSchedule,
    () => {
      console.log(`\n[${new Date().toISOString()}] Cron triggered — starting run...`);
      runLeadGenWorkflow().catch(err =>
        console.error('Unhandled scheduler error:', err.message)
      );
    },
    {
      scheduled: true,
      timezone: 'America/New_York', // handles EST/EDT automatically
    }
  );

  console.log('  Scheduler is running. Waiting for 7:00 AM ET...');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
(async function main() {
  if (args.has('--test-connection')) {
    await runConnectionTest();
  } else if (args.has('--run-now')) {
    await runOnce();
  } else {
    startScheduler();
  }
})().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
