/**
 * index.js — HVAC Lead Generation Scheduler
 *
 * Runs automatically every day at 7:00 AM Eastern Time.
 * Each run pulls up to 25 new leads from Apollo.io and appends them
 * to a Google Sheets spreadsheet — skipping any business already in the sheet.
 *
 * Usage:
 *   node index.js           → Start the scheduler (keeps running)
 *   node index.js --run-now → Run once immediately, then exit
 */

require('dotenv').config();

const cron   = require('node-cron');
const apollo = require('./apollo');
const sheets = require('./sheets');
const notify = require('./notify');
const config = require('./config');

// ─── Validate required environment variables on startup ─────────────────────

function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_KEY'];
  const missing  = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((key) => console.error(`  • ${key}`));
    console.error('\nCopy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

// ─── Core workflow ───────────────────────────────────────────────────────────

/**
 * Run a full lead generation cycle:
 *   1. Fetch leads from Apollo (all SW Michigan cities)
 *   2. Read existing business names from the sheet
 *   3. Filter out duplicates and cap at maxLeadsPerRun
 *   4. Append new leads to the sheet
 */
async function runLeadGenCycle() {
  const startTime = Date.now();
  const runLabel  = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  HVAC Lead Gen Run — ${runLabel} ET`);
  console.log(`${'═'.repeat(60)}`);

  // ── Step 1: Ensure sheet headers exist ──────────────────────────────────
  try {
    await sheets.ensureHeaders();
  } catch (err) {
    await notify.alertError('Google Sheets — ensure headers', err);
    return; // Can't continue without sheet access
  }

  // ── Step 2: Fetch leads from Apollo ─────────────────────────────────────
  let candidates = [];
  try {
    console.log('\n[Step 1] Searching Apollo.io for HVAC leads in SW Michigan…');
    candidates = await apollo.fetchAllLeads();
  } catch (err) {
    await notify.alertError('Apollo.io — people search', err);
    return;
  }

  if (candidates.length === 0) {
    console.warn('[Step 1] Apollo returned no results across all cities.');
    await notify.alertError(
      'Apollo.io — empty results',
      new Error(
        'Apollo returned 0 leads for all SW Michigan cities. ' +
        'Check your APOLLO_API_KEY, subscription tier, and search filters.'
      )
    );
    return;
  }

  // ── Step 3: Dedup against existing sheet entries ─────────────────────────
  let existingNames;
  try {
    console.log('\n[Step 2] Reading existing entries from Google Sheet to check for duplicates…');
    existingNames = await sheets.getExistingBusinessNames();
    console.log(`         ${existingNames.size} existing businesses on file.`);
  } catch (err) {
    await notify.alertError('Google Sheets — read existing entries', err);
    return;
  }

  const newLeads = candidates.filter(
    (lead) => !existingNames.has(lead.businessName.toLowerCase().trim())
  );

  if (newLeads.length === 0) {
    console.log('\n[Step 2] All leads found this run are already in the sheet — nothing to add.');
    console.log('         Consider expanding your city list or running less frequently.');
    printSummary(0, 0, candidates.length, Date.now() - startTime);
    return;
  }

  // Cap to the configured maximum per run
  const toAdd = newLeads.slice(0, config.maxLeadsPerRun);
  console.log(
    `\n[Step 2] ${newLeads.length} new leads found → adding ${toAdd.length} ` +
    `(capped at ${config.maxLeadsPerRun} per run)`
  );

  // ── Step 4: Append new leads to Google Sheet ─────────────────────────────
  let added = 0;
  try {
    console.log('\n[Step 3] Writing new leads to Google Sheet…');
    added = await sheets.appendLeads(toAdd);
    console.log(`         ✓ ${added} rows appended successfully.`);
  } catch (err) {
    await notify.alertError('Google Sheets — append leads', err);
    return;
  }

  printSummary(added, newLeads.length, candidates.length, Date.now() - startTime);
}

// ─── Pretty summary ──────────────────────────────────────────────────────────

function printSummary(added, newFound, totalFound, elapsedMs) {
  const sec = (elapsedMs / 1000).toFixed(1);
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  Run complete');
  console.log(`    Total leads from Apollo : ${totalFound}`);
  console.log(`    New (not in sheet)      : ${newFound}`);
  console.log(`    Added to sheet          : ${added}`);
  console.log(`    Elapsed                 : ${sec}s`);
  console.log(`${'─'.repeat(60)}\n`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

validateEnv();

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // One-shot mode: run immediately and exit
  console.log('[Mode] --run-now: executing single run, then exiting.');
  runLeadGenCycle()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Fatal]', err);
      process.exit(1);
    });
} else {
  // Scheduler mode: run on cron schedule
  console.log(`[Scheduler] HVAC Lead Gen is running.`);
  console.log(`            Schedule : ${config.cronSchedule} (${config.cronTimezone})`);
  console.log(`            Next run : 7:00 AM Eastern`);
  console.log(`            To run immediately: node index.js --run-now\n`);

  cron.schedule(config.cronSchedule, runLeadGenCycle, {
    timezone: config.cronTimezone,
  });
}
