'use strict';
require('dotenv').config();

const cron = require('node-cron');
const { searchAndEnrichLeads }  = require('./apollo');
const { getExistingBusinessNames, appendLeads, ensureHeaders } = require('./sheets');
const { sendErrorNotification } = require('./notify');
const { normalizeBusinessName } = require('./utils');

// Maximum leads to add per scheduled run — keeps the list manageable
const MAX_LEADS_PER_RUN = 25;

// ─── Main workflow ────────────────────────────────────────────────────────────

async function runLeadGen() {
  const runLabel = new Date().toISOString();
  console.log(`\n[${runLabel}] ── Starting HVAC lead gen run ──`);

  try {
    // 1. Make sure the sheet has header columns (idempotent)
    await ensureHeaders();

    // 2. Read what's already in the sheet (Business Name column) to skip dupes
    console.log('[run] Reading existing sheet entries...');
    const existingNames = await getExistingBusinessNames();
    console.log(`[run] ${existingNames.size} businesses already in sheet.`);

    // 3. Search Apollo and enrich for phone numbers
    console.log('[run] Searching Apollo for HVAC leads in SW Michigan...');
    const candidates = await searchAndEnrichLeads();

    if (candidates.length === 0) {
      const msg = 'Apollo returned 0 leads with phone numbers for this run. ' +
                  'This could mean the result pool is exhausted or the API key / filters need adjustment.';
      console.warn(`[run] ${msg}`);
      await sendErrorNotification('0 Apollo results', msg);
      return;
    }

    // 4. Remove businesses already in the sheet (case-insensitive, punctuation-stripped)
    const newLeads = candidates.filter(
      lead => !existingNames.has(normalizeBusinessName(lead.businessName))
    );
    const dupCount = candidates.length - newLeads.length;
    console.log(`[run] ${newLeads.length} new leads after removing ${dupCount} duplicates.`);

    if (newLeads.length === 0) {
      console.log('[run] Nothing new to add. All candidates are already in the sheet.');
      return;
    }

    // 5. Cap at MAX_LEADS_PER_RUN
    const leadsToAdd = newLeads.slice(0, MAX_LEADS_PER_RUN);
    if (newLeads.length > MAX_LEADS_PER_RUN) {
      console.log(`[run] Capping at ${MAX_LEADS_PER_RUN} leads this run (${newLeads.length - MAX_LEADS_PER_RUN} deferred to next run).`);
    }

    // 6. Append to Google Sheet
    console.log(`[run] Writing ${leadsToAdd.length} leads to Google Sheet...`);
    await appendLeads(leadsToAdd);
    console.log(`[run] Done. ${leadsToAdd.length} leads added successfully.`);

  } catch (err) {
    console.error(`[run] ERROR: ${err.message}`);
    await sendErrorNotification('Lead gen run failed', err.stack || err.message);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

// Runs every day at 7:00 AM Eastern Time
// To change the time, edit the cron expression:  minute hour * * *
cron.schedule('0 7 * * *', runLeadGen, {
  timezone: 'America/New_York',
  scheduled: true,
});

console.log('HVAC Lead Gen scheduler started.');
console.log('Scheduled: 7:00 AM Eastern Time, every day.');
console.log('Pass --run-now to execute immediately and verify everything works.\n');

// Allow an immediate test run via: node index.js --run-now
if (process.argv.includes('--run-now')) {
  runLeadGen();
}
