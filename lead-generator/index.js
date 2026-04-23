require('dotenv').config();

const { verifyConnection: verifyApollo } = require('./src/apolloClient');
const { verifyConnection: verifySheets } = require('./src/sheetsClient');
const { startScheduler } = require('./src/scheduler');
const { runLeadGeneration } = require('./src/workflow');
const logger = require('./src/logger');

// ------------------------------------------------------------------ startup check

async function verifyConnections() {
  console.log('\n─────────────────────────────────────────');
  console.log('  HVAC Lead Generator — Connection Check');
  console.log('─────────────────────────────────────────\n');

  let allOk = true;

  // Apollo.io
  process.stdout.write('  Apollo.io API      ... ');
  try {
    await verifyApollo();
    console.log('✓  OK');
  } catch (err) {
    console.log('✗  FAILED');
    logger.error('Apollo.io verification', err);
    allOk = false;
  }

  // Google Sheets
  process.stdout.write('  Google Sheets API  ... ');
  try {
    const title = await verifySheets();
    console.log(`✓  OK  (sheet: "${title}")`);
  } catch (err) {
    console.log('✗  FAILED');
    logger.error('Google Sheets verification', err);
    allOk = false;
  }

  console.log('');

  if (allOk) {
    console.log('  All connections verified.\n');
  } else {
    console.log('  One or more connections failed — check the output above.\n');
  }

  return allOk;
}

// ------------------------------------------------------------------ entry point

async function main() {
  const args = process.argv.slice(2);

  // --verify  → check connections only, then exit
  if (args.includes('--verify')) {
    const ok = await verifyConnections();
    process.exit(ok ? 0 : 1);
  }

  // --test  → verify connections, run one batch immediately, then exit
  if (args.includes('--test')) {
    const ok = await verifyConnections();
    if (!ok) {
      logger.error('Aborting test run — fix connection errors first.');
      process.exit(1);
    }
    await runLeadGeneration();
    process.exit(0);
  }

  // Default: verify connections then start daily scheduler
  const ok = await verifyConnections();
  if (!ok) {
    logger.error('Scheduler will NOT start until all connections are working.');
    process.exit(1);
  }

  startScheduler();
  logger.info('Scheduler is running. Press Ctrl+C to stop.');
}

main().catch(err => {
  logger.error('Unexpected startup error', err);
  process.exit(1);
});
