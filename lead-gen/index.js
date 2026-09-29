/**
 * index.js — HVAC Lead Generation Workflow
 *
 * Searches Apollo.io for HVAC company decision-makers in SW Michigan
 * and appends new leads (no duplicates) to the Google Sheets spreadsheet.
 *
 * Scheduled to run every day at 7:00 AM Eastern Time.
 *
 * ─── HOW TO RUN ────────────────────────────────────────────────────────────
 *
 * First-time setup (do this once):
 *   1. Copy .env.example to .env and fill in your API keys.
 *   2. Download OAuth2 credentials.json from Google Cloud Console (see setup.js).
 *   3. npm install
 *   4. npm run setup    ← runs setup.js, authorizes Google, verifies Apollo
 *
 * After setup:
 *   npm run run-now    — pull leads immediately (up to MAX_LEADS_PER_RUN)
 *   npm start          — start the daily 7am scheduler (runs continuously)
 *
 * To change target cities or industries, edit apolloSearch.js.
 * To change columns, edit sheetsClient.js.
 * To change the notification email, update NOTIFY_EMAIL in .env.
 *
 * ─── APOLLO PLAN NOTE ──────────────────────────────────────────────────────
 *
 * People API Search requires an Apollo Professional plan or above.
 * Upgrade at: https://app.apollo.io/#/settings/plans/upgrade
 *
 * ─── SPREADSHEET ───────────────────────────────────────────────────────────
 *
 * Target sheet: "HVAC Leads — SW Michigan (Master)"
 * https://docs.google.com/spreadsheets/d/1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs
 *
 * Columns: Date Added | Business Name | Owner First | Owner Last |
 *          Phone Number | City | Website | Called | Notes
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchHVACLeads } = require('./apolloSearch');
const { getExistingBusinessNames, appendLeads } = require('./sheetsClient');
const { sendErrorNotification } = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10);
const RUN_NOW = process.argv.includes('--run-now');

/**
 * Main lead pull: search Apollo, deduplicate, append to Google Sheets.
 * This is the function that runs every morning at 7am.
 */
async function runDailyLeadPull() {
  const startTime = new Date();
  console.log(`\n[${ startTime.toISOString() }] Starting HVAC lead pull (max ${MAX_LEADS} leads)...`);

  try {
    // 1. Read existing business names from the sheet for duplicate checking
    const existingNames = await getExistingBusinessNames();
    console.log(`Sheet has ${existingNames.size} existing leads.`);

    // 2. Search Apollo for HVAC contacts in SW Michigan
    const candidates = await searchHVACLeads(MAX_LEADS * 2); // fetch extra to cover dupes
    console.log(`Apollo returned ${candidates.length} candidates.`);

    if (candidates.length === 0) {
      console.log('Apollo returned no results for today\'s search. Check filters in apolloSearch.js.');
      return;
    }

    // 3. Deduplicate against the sheet
    const newLeads = candidates.filter((lead) => {
      const normalized = (lead.businessName ?? '').trim().toLowerCase();
      return normalized.length > 0 && !existingNames.has(normalized);
    });

    console.log(`${newLeads.length} new leads after deduplication (${candidates.length - newLeads.length} already in sheet).`);

    // 4. Cap at MAX_LEADS per run
    const toAdd = newLeads.slice(0, MAX_LEADS);

    if (toAdd.length === 0) {
      console.log('No new leads to add today.');
      return;
    }

    // 5. Append to the spreadsheet
    const dateAdded = startTime.toISOString().split('T')[0]; // YYYY-MM-DD
    await appendLeads(toAdd, dateAdded);

    const duration = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
    console.log(`Done. Added ${toAdd.length} new leads in ${duration}s.`);

  } catch (err) {
    console.error(`Lead pull failed: ${err.message}`);
    await sendErrorNotification(`${err.message}\n\nStack:\n${err.stack}`);
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

if (RUN_NOW) {
  // --run-now flag: execute immediately and exit
  runDailyLeadPull().then(() => {
    console.log('Manual run complete. Exiting.');
    process.exit(0);
  }).catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
} else {
  // Start the daily cron scheduler
  // node-cron supports IANA timezone strings directly
  cron.schedule('0 7 * * *', runDailyLeadPull, {
    timezone: 'America/New_York',
  });

  console.log('HVAC Lead Gen scheduler started.');
  console.log('Runs every day at 7:00 AM Eastern Time (America/New_York).');
  console.log('To trigger a run immediately: node index.js --run-now');
  console.log('Process is running — press Ctrl+C to stop.\n');
}
