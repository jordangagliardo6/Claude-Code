/**
 * index.js — Entry point for the HVAC lead generation workflow.
 *
 * Usage:
 *   node index.js          — start the scheduler (runs daily at 7am ET)
 *   node index.js --now    — run one scrape immediately, then exit
 *   node index.js --verify — test connections to Apollo + Google Sheets, then exit
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchLeads } = require('./apollo');
const { ensureHeaderRow, getExistingBusinessNames, appendLeads } = require('./sheets');
const { notifyError } = require('./notify');
const config = require('./config');

// ─── Main workflow ───────────────────────────────────────────────────────────

async function runWorkflow() {
  const runStart = new Date().toISOString();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[workflow] Starting run at ${runStart}`);
  console.log(`[workflow] Target: up to ${config.leadsPerRun} new leads`);
  console.log(`[workflow] Cities: ${config.targetCities.map((c) => c.split(',')[0]).join(', ')}`);

  try {
    // 1. Make sure the sheet has a header row
    await ensureHeaderRow();

    // 2. Read existing business names for deduplication
    console.log('[workflow] Reading existing sheet data for deduplication...');
    const existingNames = await getExistingBusinessNames();
    console.log(`[workflow] Found ${existingNames.size} existing businesses in sheet`);

    // 3. Pull leads from Apollo
    console.log('[workflow] Querying Apollo.io...');
    const leads = await searchLeads(config.leadsPerRun * 2); // fetch extras to absorb dupes
    console.log(`[workflow] Apollo returned ${leads.length} candidates with phone numbers`);

    if (!leads.length) {
      const msg = 'Apollo returned 0 results with phone numbers for the given filters.';
      console.warn(`[workflow] WARNING: ${msg}`);
      await notifyError('Apollo returned no results', new Error(msg));
      return;
    }

    // 4. Append new leads (appendLeads handles dedup internally)
    const appended = await appendLeads(leads, existingNames);
    console.log(`[workflow] ✓ Appended ${appended} new leads to Google Sheet`);

    if (appended === 0) {
      console.log('[workflow] All Apollo results were duplicates — nothing new added.');
    }

  } catch (err) {
    await notifyError('Workflow run failed', err);
  }

  console.log(`[workflow] Run complete.\n`);
}

// ─── Verify connections before the first scheduled run ───────────────────────

async function verifyConnections() {
  console.log('\n[verify] Testing Apollo.io connection...');
  const { searchLeads: testSearch } = require('./apollo');

  try {
    // Small test search — 1 result only
    const sample = await testSearch(1);
    if (sample.length >= 0) {
      console.log('[verify] ✓ Apollo.io connected successfully');
      console.log(`[verify]   Returned ${sample.length} test result(s)`);
      if (sample[0]) {
        console.log(`[verify]   Sample: ${sample[0].businessName} — ${sample[0].city}`);
      }
    }
  } catch (err) {
    console.error('[verify] ✗ Apollo.io connection FAILED:', err.message);
    process.exitCode = 1;
    return false;
  }

  console.log('\n[verify] Testing Google Sheets connection...');
  try {
    await ensureHeaderRow();
    const names = await getExistingBusinessNames();
    console.log('[verify] ✓ Google Sheets connected successfully');
    console.log(`[verify]   Sheet ID: ${process.env.GOOGLE_SHEET_ID}`);
    console.log(`[verify]   Existing rows: ${names.size}`);
  } catch (err) {
    console.error('[verify] ✗ Google Sheets connection FAILED:', err.message);
    process.exitCode = 1;
    return false;
  }

  console.log('\n[verify] ✓ All connections verified. Ready to run.\n');
  return true;
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  verifyConnections().then((ok) => {
    if (!ok) process.exit(1);
  });
} else if (args.includes('--now')) {
  console.log('[index] --now flag: running workflow immediately...');
  runWorkflow();
} else {
  // Default: start the cron scheduler
  console.log(`[index] Scheduler starting...`);
  console.log(`[index] Schedule: ${config.cronSchedule} (${config.cronTimezone})`);
  console.log(`[index] Next run: 7:00 AM Eastern Time daily`);
  console.log(`[index] Leads per run: ${config.leadsPerRun}`);

  cron.schedule(config.cronSchedule, runWorkflow, {
    timezone: config.cronTimezone,
  });

  console.log('[index] Scheduler is running. Press Ctrl+C to stop.\n');

  // Run verification once on startup so you know it's wired up correctly
  verifyConnections().then((ok) => {
    if (!ok) {
      console.error('[index] Startup verification failed — check your .env and credentials.json');
    }
  });
}
