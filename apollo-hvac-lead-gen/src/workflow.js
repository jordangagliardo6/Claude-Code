'use strict';

const { searchHVACLeads } = require('./apollo');
const { ensureHeaders, fetchExistingNames, appendLeads } = require('./sheets');
const { log, logError, sendAlert } = require('./logger');

const MAX_LEADS = () => parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10);
const SPREADSHEET_ID = () => process.env.GOOGLE_SPREADSHEET_ID;

/**
 * Main workflow entry point.
 *
 * Steps:
 *  1. Validate env vars
 *  2. Ensure spreadsheet headers exist
 *  3. Load existing business names (for duplicate check)
 *  4. Search Apollo for HVAC leads
 *  5. Deduplicate and cap at MAX_LEADS_PER_RUN
 *  6. Append new rows to the spreadsheet
 *  7. Log summary; send alert on any failure
 *
 * Always resolves (never throws) so the cron scheduler never crashes.
 * Returns { success, added, error? }.
 */
async function run() {
  const started = Date.now();
  log('─── Workflow run started ────────────────────────────────');

  const spreadsheetId = SPREADSHEET_ID();

  // ── 1. Validate required env vars ─────────────────────────
  if (!spreadsheetId) {
    return await fail(
      'Missing GOOGLE_SPREADSHEET_ID',
      new Error('GOOGLE_SPREADSHEET_ID environment variable is not set'),
    );
  }
  if (!process.env.APOLLO_API_KEY) {
    return await fail(
      'Missing APOLLO_API_KEY',
      new Error('APOLLO_API_KEY environment variable is not set'),
    );
  }

  // ── 2. Ensure header row ───────────────────────────────────
  try {
    log('Checking spreadsheet headers…');
    await ensureHeaders(spreadsheetId);
  } catch (err) {
    return await fail('Google Sheets header check failed', err);
  }

  // ── 3. Load existing names for dedup ──────────────────────
  let existingNames;
  try {
    log('Reading existing leads for duplicate detection…');
    existingNames = await fetchExistingNames(spreadsheetId);
    log(`  ${existingNames.size} existing leads found.`);
  } catch (err) {
    return await fail('Google Sheets read failed', err);
  }

  // ── 4. Search Apollo ───────────────────────────────────────
  const fetchLimit = MAX_LEADS() * 3; // fetch 3× so we still hit the cap after dedup
  log(`Searching Apollo.io for HVAC leads (fetching up to ${fetchLimit} candidates)…`);

  let apolloLeads;
  try {
    apolloLeads = await searchHVACLeads(fetchLimit);
  } catch (err) {
    return await fail('Apollo.io search failed', err, {
      hint:
        'Check your APOLLO_API_KEY and ensure your Apollo plan supports the People Search API.',
    });
  }

  if (!apolloLeads || apolloLeads.length === 0) {
    return await fail(
      'Apollo returned zero results',
      new Error(
        'Apollo.io search returned no contacts. This may be a temporary API issue, ' +
          'a rate-limit, or filters that are too narrow.',
      ),
    );
  }

  log(`  Apollo returned ${apolloLeads.length} candidates.`);

  // ── 5. Deduplicate ─────────────────────────────────────────
  const newLeads = apolloLeads.filter((lead) => {
    const key = lead.businessName.toLowerCase().trim();
    return key.length > 0 && !existingNames.has(key);
  });

  log(`  After dedup: ${newLeads.length} new leads.`);

  if (newLeads.length === 0) {
    log('No new leads to add — all Apollo results already exist in the spreadsheet.');
    log(`─── Workflow complete (0 added, ${elapsed(started)}) ───────────`);
    return { success: true, added: 0 };
  }

  // ── 6. Write to Sheets ─────────────────────────────────────
  const batch = newLeads.slice(0, MAX_LEADS());
  log(`Writing ${batch.length} new leads to Google Sheets…`);

  let added;
  try {
    added = await appendLeads(spreadsheetId, batch);
  } catch (err) {
    return await fail('Google Sheets write failed', err, {
      hint:
        `${batch.length} leads were fetched from Apollo but NOT saved. ` +
        'Check service account permissions on the spreadsheet.',
    });
  }

  // ── 7. Summary ─────────────────────────────────────────────
  log(`  ${added} leads written successfully.`);
  log(`─── Workflow complete (${added} added, ${elapsed(started)}) ──────`);
  return { success: true, added };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fail(context, err, { hint } = {}) {
  logError(context, err);

  const bodyLines = [
    `Time: ${new Date().toISOString()}`,
    `Error: ${err.message}`,
    hint ? `\nHint: ${hint}` : '',
    '\nCheck lead-gen.log for the full stack trace.',
  ].filter(Boolean);

  await sendAlert(context, bodyLines.join('\n'));
  return { success: false, error: err.message };
}

function elapsed(start) {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

module.exports = { run };
