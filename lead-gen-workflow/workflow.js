/**
 * workflow.js — Main orchestration
 *
 * Called by the scheduler (index.js) on each run.
 * Also called directly for --run-now and --check-connections.
 *
 * Flow:
 *   1. Fetch HVAC leads from Apollo.io (max 25)
 *   2. Filter out contacts with no phone number
 *   3. Append new leads to Google Sheets (duplicate check happens in sheets.js)
 *   4. On error: log + send email notification
 */

const { fetchHvacLeads, testApolloConnection } = require('./apollo');
const { appendLeads, testSheetsConnection }    = require('./sheets');
const { notifyError, notifySuccess }           = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const START_PAGE = parseInt(process.env.APOLLO_START_PAGE || '1', 10);

// ─── Main run ─────────────────────────────────────────────────────────────────

async function runWorkflow() {
  const runStart = new Date();
  const label = `[${runStart.toISOString()}]`;
  console.log(`${label} ─── Lead Gen Run Starting ───`);

  let leads = [];
  let added = 0;

  try {
    // ── Step 1: Fetch leads from Apollo ─────────────────────────────────────
    console.log(`${label} Searching Apollo.io for SW Michigan HVAC leads...`);
    leads = await fetchHvacLeads(MAX_LEADS, START_PAGE);

    if (leads.length === 0) {
      const msg = 'Apollo returned 0 results. This may mean the filters are too narrow or credits are exhausted.';
      console.warn(`${label} ${msg}`);
      await notifyError('Apollo returned no results', msg);
      return;
    }

    console.log(`${label} Apollo returned ${leads.length} contact(s) with phone numbers.`);

    // Log a brief preview
    leads.slice(0, 3).forEach(l => {
      console.log(`  • ${l.businessName} — ${l.firstName} ${l.lastName} (${l.title}) — ${l.city} — ${l.phone}`);
    });
    if (leads.length > 3) console.log(`  … and ${leads.length - 3} more.`);

    // ── Step 2: Write to Google Sheets ──────────────────────────────────────
    console.log(`${label} Appending to spreadsheet (skipping duplicates)...`);
    added = await appendLeads(leads);

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    const skipped = leads.length - added;
    console.log(`${label} ─── Run Complete in ${elapsed}s: ${added} added, ${skipped} skipped ───`);

    await notifySuccess(added, skipped, leads.length);

  } catch (err) {
    const msg = err.message || String(err);
    console.error(`${label} FATAL ERROR: ${msg}`);
    await notifyError(
      msg.length > 80 ? msg.slice(0, 80) + '…' : msg,
      `Full error:\n${err.stack || msg}\n\nLeads fetched before error: ${leads.length}\nLeads added before error: ${added}`
    );
  }
}

// ─── Connection check ─────────────────────────────────────────────────────────

async function checkConnections() {
  console.log('\n═══ Connection Check ═══\n');
  let ok = true;

  // Apollo
  process.stdout.write('Apollo.io API key … ');
  try {
    const info = await testApolloConnection();
    console.log(`✓  Connected (${info.name}, ${info.email}, plan: ${info.plan})`);
  } catch (err) {
    console.log(`✗  FAILED: ${err.message}`);
    ok = false;
  }

  // Google Sheets
  process.stdout.write('Google Sheets access … ');
  try {
    const info = await testSheetsConnection();
    console.log(`✓  Connected (spreadsheet: "${info.title}", tabs: ${info.tabs})`);
  } catch (err) {
    console.log(`✗  FAILED: ${err.message}`);
    ok = false;
  }

  if (ok) {
    console.log('\n✓  All connections verified. Safe to start the scheduler.\n');
  } else {
    console.log('\n✗  One or more connections failed. Fix the errors above before scheduling.\n');
  }

  return ok;
}

module.exports = { runWorkflow, checkConnections };
