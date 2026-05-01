/**
 * index.js — Entry point
 *
 * Modes:
 *   node index.js              → start the daily 7am cron scheduler
 *   node index.js --test       → verify Apollo + Google Sheets connections, then exit
 *   node index.js --run-now    → run the workflow once immediately, then exit
 */

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const { testConnection } = require('./src/sheets');
const { fetchLeads } = require('./src/apollo');

// ── Validate required env vars ────────────────────────────────────────────────
function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Copy .env.example → .env and fill in the values.');
    process.exit(1);
  }
}

// ── Connection test ───────────────────────────────────────────────────────────
async function testConnections() {
  validateEnv();
  console.log('\n=== Connection Test ===\n');

  // Test Apollo
  process.stdout.write('Apollo.io ... ');
  try {
    const leads = await fetchLeads(process.env.APOLLO_API_KEY, 1);
    console.log(`OK  (test fetch returned ${leads.length} lead(s))`);
  } catch (err) {
    console.log('FAILED');
    console.error('  ', err.message);
    process.exit(1);
  }

  // Test Google Sheets
  process.stdout.write('Google Sheets ... ');
  try {
    const title = await testConnection({
      serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/service-account.json',
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    });
    console.log(`OK  (spreadsheet: "${title}")`);
  } catch (err) {
    console.log('FAILED');
    console.error('  ', err.message);
    process.exit(1);
  }

  console.log('\nAll connections verified. You are ready to run the scheduler.\n');
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function startScheduler() {
  validateEnv();

  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
  const timezone = process.env.TIMEZONE || 'America/New_York';

  console.log(`\nLead-gen scheduler started.`);
  console.log(`  Schedule : ${schedule} (${timezone})`);
  console.log(`  Next run : ${getNextRunDescription(schedule, timezone)}`);
  console.log('  Press Ctrl+C to stop.\n');

  cron.schedule(schedule, () => {
    runWorkflow().catch(err => {
      console.error('[scheduler] Unhandled error in runWorkflow:', err.message);
    });
  }, { timezone });
}

function getNextRunDescription(schedule, timezone) {
  try {
    // node-cron doesn't expose next-run natively; give a human hint instead.
    return `Next occurrence of "${schedule}" in ${timezone}`;
  } catch {
    return 'unknown';
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--test')) {
  testConnections().catch(err => {
    console.error('Unexpected error:', err.message);
    process.exit(1);
  });
} else if (args.includes('--run-now')) {
  validateEnv();
  runWorkflow().then(() => process.exit(0)).catch(err => {
    console.error('Run failed:', err.message);
    process.exit(1);
  });
} else {
  startScheduler();
}
