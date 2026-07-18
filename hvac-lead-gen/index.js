/**
 * HVAC Lead Generation — Southwest Michigan
 *
 * Scheduled to run every morning at 7:00 AM Eastern via node-cron.
 * Pulls up to MAX_LEADS_PER_RUN contacts from Apollo.io and appends
 * them to a Google Sheet, skipping any business already in the sheet.
 *
 * Usage:
 *   node index.js           → start the scheduler (runs at 7am Eastern every day)
 *   node index.js --test    → run immediately once, then exit
 *   node index.js --verify  → check Apollo + Google auth only (no data written)
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchHvacLeads } = require('./apollo');
const { getAuthClient, getExistingBusinessNames, appendLeads, ensureHeaderRow } = require('./sheets');
const { notifyError, logSuccess } = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ─── Main workflow ──────────────────────────────────────────────────────────

async function runLeadGen() {
  console.log(`\n[${new Date().toISOString()}] Starting HVAC lead gen run (max ${MAX_LEADS} leads)...`);

  let auth;
  try {
    auth = await getAuthClient();
  } catch (err) {
    notifyError('Google Auth', err);
    return;
  }

  // Make sure the header row is in place
  try {
    await ensureHeaderRow(auth);
  } catch (err) {
    notifyError('Ensure Header Row', err);
    return;
  }

  // Fetch existing business names to prevent duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(auth);
  } catch (err) {
    notifyError('Read Google Sheet', err);
    return;
  }

  // Search Apollo.io
  let leads = [];
  try {
    leads = await searchHvacLeads(MAX_LEADS);
  } catch (err) {
    notifyError('Apollo Search', err);
    return;
  }

  if (!leads.length) {
    notifyError('Apollo Search', new Error('Apollo returned 0 usable leads. No data written.'));
    return;
  }

  // Write to Google Sheet
  let added = 0;
  try {
    added = await appendLeads(auth, leads, existingNames);
  } catch (err) {
    notifyError('Google Sheet Write', err);
    return;
  }

  logSuccess(added, leads.length);
}

// ─── Verify mode ────────────────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n=== HVAC Lead Gen — Connection Verification ===\n');

  // 1. Apollo.io
  console.log('1. Checking Apollo.io...');
  try {
    const leads = await searchHvacLeads(1);
    console.log(`   ✓ Apollo connected. Test search returned ${leads.length} result(s).`);
  } catch (err) {
    console.error(`   ✗ Apollo FAILED: ${err.message}`);
    process.exitCode = 1;
  }

  // 2. Google Sheets
  console.log('2. Checking Google Drive / Sheets...');
  try {
    const auth = await getAuthClient();
    await ensureHeaderRow(auth);
    const names = await getExistingBusinessNames(auth);
    console.log(`   ✓ Google Sheets connected. Sheet has ${names.size} existing businesses.`);
  } catch (err) {
    console.error(`   ✗ Google Sheets FAILED: ${err.message}`);
    process.exitCode = 1;
  }

  console.log('\n=== Verification complete. ===');
  if (process.exitCode === 1) {
    console.log('Fix the errors above before letting the scheduler run.\n');
  } else {
    console.log('Both connections are healthy. Run `node index.js` to start the scheduler.\n');
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  verifyConnections();
} else if (args.includes('--test')) {
  // Run once immediately and exit
  runLeadGen().then(() => {
    console.log('Test run complete. Exiting.');
    process.exit(0);
  });
} else {
  // Production scheduler
  // node-cron uses the server's local time; TZ env var shifts it to Eastern.
  // The cron expression "0 7 * * *" fires at 7:00 AM every day.
  process.env.TZ = process.env.TZ || 'America/New_York';

  console.log(`HVAC Lead Gen scheduler starting.`);
  console.log(`Timezone: ${process.env.TZ}`);
  console.log(`Will run daily at 7:00 AM Eastern (max ${MAX_LEADS} leads per run).`);
  console.log(`Press Ctrl+C to stop.\n`);

  // Run once at startup so you can confirm it works without waiting until 7am
  console.log('Running once at startup to verify everything works...');
  runLeadGen().then(() => {
    console.log('\nStartup run done. Scheduler is now active.\n');
  });

  // Schedule daily at 7am Eastern
  cron.schedule('0 7 * * *', () => {
    runLeadGen();
  }, {
    timezone: 'America/New_York',
  });
}
