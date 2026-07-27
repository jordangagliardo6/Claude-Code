/**
 * workflow.js — One run of the lead generation workflow.
 *
 * Called by the cron scheduler in index.js on each 7am ET firing.
 * Can also be imported and called directly for testing.
 */

'use strict';

const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');

const MAX_LEADS_PER_RUN = 25;   // ← change this if you want more/fewer per day

async function runWorkflow() {
  const start = new Date();
  const tag = `[${start.toISOString()}]`;

  console.log(`\n${tag} ─── Lead gen run starting ───`);

  // ── Step 1: Pull from Apollo ──────────────────────────────────────────────

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment.');

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not set in environment.');

  let leads;
  try {
    console.log(`${tag} Searching Apollo for HVAC leads in SW Michigan...`);
    leads = await searchLeads(apiKey, MAX_LEADS_PER_RUN);
    console.log(`${tag} Apollo returned ${leads.length} lead(s) with phone numbers.`);
  } catch (err) {
    throw new Error(`Apollo search failed: ${err.message}`);
  }

  if (leads.length === 0) {
    console.warn(`${tag} ⚠ Apollo returned 0 results. Nothing to write.`);
    return { added: 0, skipped: 0, total: 0 };
  }

  // ── Step 2: Append to Google Sheets ──────────────────────────────────────

  let result;
  try {
    console.log(`${tag} Writing to Google Sheet (spreadsheetId=${spreadsheetId})...`);
    result = await appendLeads(spreadsheetId, leads);
  } catch (err) {
    throw new Error(`Google Sheets write failed: ${err.message}`);
  }

  const elapsed = ((Date.now() - start.getTime()) / 1000).toFixed(1);
  console.log(
    `${tag} ✓ Done in ${elapsed}s — added ${result.added} new lead(s), ` +
    `skipped ${result.skipped} duplicate(s).`
  );

  return { added: result.added, skipped: result.skipped, total: leads.length };
}

module.exports = { runWorkflow };
