/**
 * Entry point for the HVAC Lead Generation Workflow.
 *
 * Usage:
 *   node index.js          — verify connections, then start the 7am daily scheduler
 *   node index.js --test   — verify connections AND run the workflow once immediately
 *   node index.js --now    — skip connection test, run the workflow once immediately
 */

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');

// ─── Connection Tests ─────────────────────────────────────────────────────────

async function testApolloConnection() {
  const { searchHVACLeads } = require('./src/apollo');
  const result = await searchHVACLeads(1, 1);
  const count = (result.people || result.contacts || []).length;
  const total = result.pagination?.total_entries ?? result.total_entries ?? '?';
  console.log(`  ✓ Apollo.io  — connected. Test query found ${total} total matching contacts.`);
}

async function testSheetsConnection() {
  const { ensureHeaderRow, getExistingBusinessNames } = require('./src/sheets');
  await ensureHeaderRow();
  const existing = await getExistingBusinessNames();
  console.log(`  ✓ Google Sheets — connected. Spreadsheet has ${existing.size} existing lead(s).`);
}

async function testConnections() {
  console.log('\nVerifying API connections...');

  let allPassed = true;

  try {
    await testApolloConnection();
  } catch (err) {
    console.error(`  ✗ Apollo.io   — FAILED: ${err.response?.data?.message || err.message}`);
    allPassed = false;
  }

  try {
    await testSheetsConnection();
  } catch (err) {
    console.error(`  ✗ Google Sheets — FAILED: ${err.message}`);
    allPassed = false;
  }

  if (!allPassed) {
    console.error('\nOne or more connections failed. Fix the errors above, then re-run.\n');
    process.exit(1);
  }

  console.log('\nAll connections verified successfully.\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  console.log('═══════════════════════════════════════════════════');
  console.log('  HVAC Lead Generation Workflow');
  console.log('  Southwest Michigan | Apollo.io → Google Sheets');
  console.log('═══════════════════════════════════════════════════');

  if (args.includes('--now')) {
    // Run immediately without connection test (useful if you trust the env is correct)
    await runWorkflow();
    return;
  }

  // Always test connections first
  await testConnections();

  if (args.includes('--test')) {
    // Run one full workflow cycle right now
    console.log('Running workflow now (--test mode)...');
    const result = await runWorkflow();
    if (result.success) {
      console.log('\nTest run complete. Your setup is working correctly.');
    } else {
      console.error('\nTest run failed. See error output above.');
      process.exit(1);
    }
    return;
  }

  // Production mode: start the cron scheduler
  // Runs every day at 7:00 AM Eastern Time (handles EST/EDT automatically)
  cron.schedule('0 7 * * *', async () => {
    console.log('Cron trigger fired — starting scheduled workflow run...');
    await runWorkflow();
  }, {
    timezone: 'America/New_York',
  });

  const nextRun = getNextRunTime();
  console.log(`Scheduler started. Next run: ${nextRun}`);
  console.log('The workflow will run every morning at 7:00 AM Eastern Time.');
  console.log('Press Ctrl+C to stop.\n');

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\nScheduler stopped.');
    process.exit(0);
  });
}

function getNextRunTime() {
  const now = new Date();
  const next = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

main().catch(err => {
  console.error('\nFatal error during startup:', err.message);
  process.exit(1);
});
