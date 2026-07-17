'use strict';

// ─── HVAC Lead Generation — Entry Point ──────────────────────
// Runs once immediately if you call `node index.js --now`,
// then starts the daily 7am ET cron.
//
// Normal usage:   node index.js          ← cron only
// One-shot test:  node index.js --now    ← run immediately + cron

require('dotenv').config();
const cron = require('node-cron');
const { searchLeads } = require('./apollo');
const { getExistingBusinessNames, ensureHeaders, appendLeads } = require('./sheets');
const { sendAlert } = require('./notify');
const config = require('./config');

// ── Validate required env vars on startup ─────────────────────
function validateEnv() {
  const missing = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'].filter(
    (k) => !process.env[k]
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in your keys.'
    );
  }
}

// ── Core workflow ─────────────────────────────────────────────
async function runLeadGen() {
  const startedAt = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[lead-gen] Run started at ${startedAt}`);

  const apiKey = process.env.APOLLO_API_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  // ── Step 1: Ensure the sheet has headers ─────────────────
  try {
    await ensureHeaders(spreadsheetId, tab);
  } catch (err) {
    await sendAlert(
      'Google Sheets connection failed',
      `Could not access spreadsheet "${spreadsheetId}".\nError: ${err.message}\n\nCheck GOOGLE_SPREADSHEET_ID, your credentials.json, and token.json.`
    );
    return;
  }

  // ── Step 2: Read existing business names (for dedup) ─────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(spreadsheetId, tab);
    console.log(`[lead-gen] ${existingNames.size} businesses already in sheet.`);
  } catch (err) {
    await sendAlert('Failed to read existing leads from sheet', err.message);
    return;
  }

  // ── Step 3: Search Apollo for new leads ──────────────────
  let apolloResults;
  try {
    // Fetch a larger page so we have headroom to filter duplicates.
    // We'll cap the final insert at config.maxLeadsPerRun.
    apolloResults = await searchLeads(apiKey, 100, 1);
    console.log(`[lead-gen] Apollo returned ${apolloResults.length} contacts with phone numbers.`);
  } catch (err) {
    await sendAlert(
      'Apollo.io search failed',
      `Error: ${err.message}\n\nCheck APOLLO_API_KEY and that your Apollo plan supports People Search.`
    );
    return;
  }

  if (apolloResults.length === 0) {
    await sendAlert(
      'Apollo returned 0 results',
      `Search returned no contacts for SW Michigan HVAC.\n` +
      `Filters used:\n  Locations: ${config.targetLocations.join(', ')}\n` +
      `  Titles: ${config.jobTitles.join(', ')}\n  Employees: ${config.employeeRange}\n\n` +
      `Try broadening the keyword or location in config.js.`
    );
    return;
  }

  // ── Step 4: Deduplicate against existing sheet data ──────
  const newLeads = apolloResults.filter((lead) => {
    const key = lead.businessName.toLowerCase().trim();
    return key.length > 0 && !existingNames.has(key);
  });

  console.log(`[lead-gen] ${newLeads.length} leads are new (not already in sheet).`);

  if (newLeads.length === 0) {
    console.log('[lead-gen] No new leads to add today. All Apollo results are already in the sheet.');
    console.log('[lead-gen] Done.\n');
    return;
  }

  // ── Step 5: Cap to maxLeadsPerRun and append ─────────────
  const batch = newLeads.slice(0, config.maxLeadsPerRun);

  let added;
  try {
    added = await appendLeads(spreadsheetId, tab, batch);
  } catch (err) {
    await sendAlert(
      'Google Sheets write failed',
      `Fetched ${batch.length} new leads from Apollo but could not write to sheet.\nError: ${err.message}`
    );
    return;
  }

  console.log(`[lead-gen] ✓ Added ${added} new leads to "${tab}" tab.`);
  console.log(`[lead-gen] Done at ${new Date().toISOString()}\n`);
}

// ── Startup ───────────────────────────────────────────────────
(async () => {
  try {
    validateEnv();
  } catch (err) {
    console.error(`[lead-gen] Startup error: ${err.message}`);
    process.exit(1);
  }

  // --now flag: run once immediately before the cron starts
  if (process.argv.includes('--now')) {
    console.log('[lead-gen] --now flag detected, running immediately...');
    await runLeadGen();
  }

  // Schedule the daily 7am ET run
  cron.schedule(config.cronSchedule, runLeadGen, {
    timezone: config.timezone,
  });

  const nextRun = getNextRunDescription();
  console.log(`[lead-gen] Scheduler active. Next run: ${nextRun} (${config.timezone})`);
  console.log('[lead-gen] Keep this process running (e.g. with pm2, systemd, or screen).');
  console.log('[lead-gen] Press Ctrl+C to stop.\n');
})();

function getNextRunDescription() {
  // node-cron doesn't expose the next fire time, so we compute it manually
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);
  return tomorrow.toLocaleString('en-US', {
    timeZone: config.timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
