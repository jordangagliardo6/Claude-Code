/**
 * index.js — HVAC Lead Generation Scheduler
 *
 * Runs automatically at 7:00 AM Eastern every day.
 * Pulls up to 25 new leads from Apollo.io (HVAC/plumbing/mechanical, SW Michigan,
 * owner-operated small businesses) and appends them to your Google Sheet,
 * skipping any business already in the sheet.
 *
 * Usage:
 *   node index.js            → start the scheduler (runs at 7am daily)
 *   node index.js --now      → run immediately (first-run test)
 *   node index.js --verify   → check API connections without adding any leads
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');

const { searchHVACLeads }               = require('./apollo');
const { getExistingNames, appendLeads, verifyConnection } = require('./sheets');
const { sendErrorAlert }                = require('./notify');

// ── Config ────────────────────────────────────────────────────────────────────

// Maximum new leads added per scheduled run.
// Keep this small (25) so your call list stays manageable each morning.
const MAX_LEADS_PER_RUN = 25;

// Fetch 3× the limit from Apollo so deduplication still leaves enough.
const APOLLO_FETCH_BUFFER = MAX_LEADS_PER_RUN * 3;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ── Core run logic ────────────────────────────────────────────────────────────

async function run() {
  const startTime = new Date();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[${startTime.toISOString()}] Lead gen run starting…`);
  console.log('═'.repeat(60));

  // Guard: spreadsheet ID required
  if (!SPREADSHEET_ID) {
    const msg = 'SPREADSHEET_ID is not set. Add it to your .env file.';
    console.error(`[ERROR] ${msg}`);
    await sendErrorAlert('Missing SPREADSHEET_ID', msg);
    return;
  }

  try {
    // ── Step 1: Pull leads from Apollo ───────────────────────────────────────
    console.log('\n[1/4] Searching Apollo.io for SW Michigan HVAC leads…');
    const rawLeads = await searchHVACLeads(APOLLO_FETCH_BUFFER);

    if (!rawLeads || rawLeads.length === 0) {
      const msg = 'Apollo returned zero results. Verify your API key and check your Apollo plan limits.';
      console.error(`[ERROR] ${msg}`);
      await sendErrorAlert('Apollo returned no results', msg);
      return;
    }
    console.log(`  Apollo returned ${rawLeads.length} raw lead(s) with phone numbers.`);

    // ── Step 2: Load existing business names from the sheet ──────────────────
    console.log('\n[2/4] Reading existing businesses from Google Sheet…');
    const existingNames = await getExistingNames(SPREADSHEET_ID);
    const existingSet   = new Set(existingNames.map(n => n.toLowerCase().trim()));
    console.log(`  Sheet currently has ${existingNames.length} business(es).`);

    // ── Step 3: Deduplicate and cap at MAX_LEADS_PER_RUN ────────────────────
    console.log('\n[3/4] Filtering duplicates…');
    const newLeads = rawLeads
      .filter(lead => {
        if (!lead.businessName) return false;
        return !existingSet.has(lead.businessName.toLowerCase().trim());
      })
      .slice(0, MAX_LEADS_PER_RUN);

    if (newLeads.length === 0) {
      console.log('  No new leads this run — all Apollo results are already in the sheet.');
      console.log('  Tip: Apollo paginates results. Tomorrow\'s run may surface new contacts.');
      return;
    }
    console.log(`  ${newLeads.length} new lead(s) to add.`);

    // ── Step 4: Append to Google Sheet ───────────────────────────────────────
    console.log('\n[4/4] Writing to Google Sheet…');
    await appendLeads(SPREADSHEET_ID, newLeads);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✓ Done in ${elapsed}s — ${newLeads.length} new lead(s) added to the sheet.`);

    // Print a quick summary table to the console
    console.log('\n' + '─'.repeat(60));
    console.log('  # | Business Name                 | Phone          | City');
    console.log('─'.repeat(60));
    newLeads.forEach((lead, i) => {
      const num  = String(i + 1).padStart(2);
      const biz  = (lead.businessName || '').slice(0, 29).padEnd(29);
      const ph   = (lead.phone        || '').padEnd(14);
      const city = lead.city || '';
      console.log(`  ${num} | ${biz} | ${ph} | ${city}`);
    });
    console.log('─'.repeat(60));

  } catch (err) {
    const msg = `${err.message}\n\n${err.stack}`;
    console.error(`\n[ERROR] Run failed:\n${msg}`);
    await sendErrorAlert('Run failed — check logs', msg);
  }
}

// ── --verify mode: connection check only ─────────────────────────────────────

async function verify() {
  console.log('Running connection verification…\n');
  let apolloOk  = false;
  let sheetsOk  = false;

  // Check Apollo
  process.stdout.write('  Apollo.io API key… ');
  try {
    const { searchHVACLeads: search } = require('./apollo');
    // A minimal search — 1 result, first city only — just to ping the API
    const leads = await search(1);
    apolloOk = true;
    console.log(`✓ connected  (${leads.length} sample result(s) returned)`);
  } catch (err) {
    console.log(`✗ FAILED: ${err.message}`);
  }

  // Check Google Sheets
  process.stdout.write('  Google Sheets connection… ');
  if (!SPREADSHEET_ID) {
    console.log('✗ SKIPPED — SPREADSHEET_ID not set in .env');
  } else {
    try {
      await verifyConnection(SPREADSHEET_ID);
      sheetsOk = true;
      console.log('✓ connected');
    } catch (err) {
      console.log(`✗ FAILED: ${err.message}`);
    }
  }

  console.log('');
  if (apolloOk && sheetsOk) {
    console.log('✓ Both connections verified. Run "node index.js --now" to do a live test run.');
  } else {
    console.log('✗ One or more connections failed. Fix the errors above before scheduling.');
    process.exit(1);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  // Connection check only — no leads pulled, no sheet writes
  verify().catch(err => {
    console.error(err);
    process.exit(1);
  });

} else if (args.includes('--now')) {
  // Immediate one-shot run (for testing)
  run();

} else {
  // Normal mode: start the daily cron scheduler
  // Cron format: minute hour day month weekday
  //   '0 7 * * *'  = every day at 07:00
  // America/New_York handles EST ↔ EDT transitions automatically.
  cron.schedule('0 7 * * *', run, { timezone: 'America/New_York' });

  const nextRun = 'every day at 7:00 AM Eastern';
  console.log(`HVAC lead gen scheduler started — runs ${nextRun}.`);
  console.log('Press Ctrl+C to stop.\n');
  console.log('Tip: to run immediately without waiting, use: node index.js --now');
  console.log('Tip: to verify API connections only, use:     node index.js --verify');
}
