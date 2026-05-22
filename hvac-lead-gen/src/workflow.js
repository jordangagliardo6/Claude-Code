'use strict';

const { fetchLeads }            = require('./apollo');
const { ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');
const { alertError, logSuccess }= require('./notify');
const { MAX_LEADS_PER_RUN }     = require('../config');

/**
 * Main workflow — called by the scheduler and by `npm run run-now`.
 *
 * Steps:
 *  1. Fetch up to MAX_LEADS_PER_RUN leads from Apollo.io
 *  2. Read the sheet to build a duplicate-name Set
 *  3. Filter out any business already in the sheet
 *  4. Append new leads
 *  5. Log/email on any failure
 *
 * @returns {{ added: number, skipped: number }}
 */
async function runWorkflow() {
  console.log(`\n🔍  Starting HVAC lead gen run — ${new Date().toISOString()}`);

  let apolloLeads = [];
  let existing    = new Set();

  // ── Step 1: fetch from Apollo ────────────────────────────────────────────
  try {
    apolloLeads = await fetchLeads(MAX_LEADS_PER_RUN);
    console.log(`   Apollo returned ${apolloLeads.length} candidate leads`);

    if (apolloLeads.length === 0) {
      await alertError(
        'Apollo returned 0 results',
        'No leads matched the current search criteria. ' +
        'Check your Apollo API key, subscription limits, or broaden the city/industry filters in config.js.'
      );
      return { added: 0, skipped: 0 };
    }
  } catch (err) {
    await alertError('Apollo API error', err);
    return { added: 0, skipped: 0 };
  }

  // ── Step 2: read existing sheet rows ────────────────────────────────────
  try {
    await ensureHeaders();
    existing = await getExistingBusinessNames();
    console.log(`   Sheet already contains ${existing.size} unique businesses`);
  } catch (err) {
    await alertError('Google Sheets read error', err);
    return { added: 0, skipped: 0 };
  }

  // ── Step 3: de-duplicate ────────────────────────────────────────────────
  const newLeads = apolloLeads.filter(
    lead => lead.businessName && !existing.has(lead.businessName.toLowerCase())
  );
  const skipped = apolloLeads.length - newLeads.length;
  console.log(`   ${newLeads.length} new / ${skipped} duplicates filtered out`);

  if (newLeads.length === 0) {
    console.log('   Nothing new to add. All leads already exist in the sheet.');
    logSuccess(0, skipped);
    return { added: 0, skipped };
  }

  // ── Step 4: append to sheet ─────────────────────────────────────────────
  try {
    const added = await appendLeads(newLeads);
    logSuccess(added, skipped);
    return { added, skipped };
  } catch (err) {
    await alertError('Google Sheets write error', err);
    return { added: 0, skipped };
  }
}

module.exports = { runWorkflow };
