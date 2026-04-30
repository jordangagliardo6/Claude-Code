/**
 * workflow.js
 * Orchestrates a single lead-generation run:
 *   1. Search Apollo.io for HVAC leads in Southwest Michigan
 *   2. Deduplicate against existing sheet rows
 *   3. Append new leads to Google Sheets
 *   4. Alert on any failure
 */

'use strict';

const { searchHVACLeads } = require('./apolloSearch');
const { appendLeads } = require('./googleSheets');
const { sendErrorNotification } = require('./notifications');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10);

async function runWorkflow() {
  const startTime = new Date();
  console.log(`\n${'='.repeat(55)}`);
  console.log(` Lead Gen Run — ${startTime.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log(`${'='.repeat(55)}`);

  // ── Step 1: Apollo search ────────────────────────────────────────────────
  let leads = [];
  try {
    console.log(`\n[1/2] Searching Apollo.io (max ${MAX_LEADS} leads)...`);
    leads = await searchHVACLeads(MAX_LEADS);
    console.log(`      Found ${leads.length} lead(s) with phone numbers.`);

    if (leads.length === 0) {
      const msg =
        'Apollo.io returned no results matching the search criteria. ' +
        'No entries were written to the spreadsheet. ' +
        'Consider broadening the city list or industry keywords in apolloSearch.js.';
      console.warn(`\n[WARN] ${msg}`);
      await sendErrorNotification('No leads returned by Apollo', msg);
      console.log('\n[Done] Run ended early — no leads to add.\n');
      return;
    }
  } catch (err) {
    await sendErrorNotification('Apollo search failed', err.message);
    console.error('\n[Done] Run aborted due to Apollo error.\n');
    return;
  }

  // ── Step 2: Write to Google Sheets ───────────────────────────────────────
  try {
    console.log('\n[2/2] Appending leads to Google Sheets...');
    const { added, skipped } = await appendLeads(leads);
    console.log(`      Added   : ${added} new lead(s)`);
    console.log(`      Skipped : ${skipped} duplicate(s)`);
  } catch (err) {
    await sendErrorNotification('Google Sheets write failed', err.message);
    console.error('\n[Done] Run aborted due to Google Sheets error.\n');
    return;
  }

  const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
  console.log(`\n[Done] Run complete in ${elapsed}s.\n`);
}

module.exports = { runWorkflow };
