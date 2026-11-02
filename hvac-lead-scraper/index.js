// ============================================================
// HVAC Lead Scraper — Main Entry Point
// Runs daily at 7 AM Eastern Time via node-cron.
// Usage: node index.js
// ============================================================

require('dotenv').config();
const cron                                  = require('node-cron');
const config                                = require('./config');
const { getOAuthClient }                    = require('./auth');
const { searchHvacLeads }                   = require('./apollo');
const { getExistingBusinessNames,
        appendLeads, ensureHeaderRow }       = require('./sheets');
const { sendErrorAlert }                    = require('./notify');

// ── Core run logic ────────────────────────────────────────────
async function runScraper() {
  const startTime = new Date().toISOString();
  console.log(`\n[${startTime}] HVAC lead scraper started.`);

  let auth;
  try {
    auth = getOAuthClient();
  } catch (err) {
    await sendErrorAlert(
      'Google auth setup failed',
      `Could not create OAuth client.\n\nError: ${err.message}\n\n` +
      'Run `npm run setup` to complete the Google authentication.'
    );
    return;
  }

  // 1. Fetch leads from Apollo.io
  let apolloLeads;
  try {
    console.log('Searching Apollo.io for HVAC contacts in Southwest Michigan…');
    // Request more than maxLeadsPerRun to allow for duplicate removal.
    apolloLeads = await searchHvacLeads(config.maxLeadsPerRun * 3);
    console.log(`Apollo returned ${apolloLeads.length} qualifying contact(s) (in-region, has phone).`);
  } catch (err) {
    await sendErrorAlert(
      'Apollo.io search failed',
      `Error: ${err.message}\n\nThe scheduled run at ${startTime} produced no leads.\n` +
      'Check your APOLLO_API_KEY and ensure you have sufficient API credits.'
    );
    return;
  }

  if (apolloLeads.length === 0) {
    await sendErrorAlert(
      'Apollo returned 0 results',
      `The search at ${startTime} returned no HVAC contacts for Southwest Michigan.\n\n` +
      'Possible causes:\n' +
      '  • API key hit rate/quota limit\n' +
      '  • Industry tag IDs are filtering too aggressively (try clearing config.industryTagIds)\n' +
      '  • All contacts in the region already seen by Apollo'
    );
    return;
  }

  // 2. Ensure the sheet has a header row before any reads/writes.
  try {
    await ensureHeaderRow(auth);
  } catch (err) {
    await sendErrorAlert(
      'Google Sheets header check failed',
      `Could not verify spreadsheet header row.\n\nError: ${err.message}\n\n` +
      'Check GOOGLE_SHEET_ID and GOOGLE_SHEET_TAB in your .env file, and confirm ' +
      'the sheet is shared with (or owned by) your Google account.'
    );
    return;
  }

  // 3. Read existing business names to avoid duplicates.
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(auth);
    console.log(`Spreadsheet has ${existingNames.length} existing lead(s).`);
  } catch (err) {
    await sendErrorAlert(
      'Google Sheets read failed',
      `Could not read existing leads from spreadsheet.\n\nError: ${err.message}`
    );
    return;
  }

  // 4. Filter out duplicates (compare business name case-insensitively).
  const newLeads = apolloLeads.filter(lead => {
    const name = lead.businessName.toLowerCase().trim();
    return name && !existingNames.includes(name);
  });

  // 5. Cap to maxLeadsPerRun.
  const leadsToAdd = newLeads.slice(0, config.maxLeadsPerRun);

  if (leadsToAdd.length === 0) {
    console.log('No new leads to add — all Apollo results are already in the spreadsheet.');
    return;
  }

  console.log(
    `Adding ${leadsToAdd.length} new lead(s) ` +
    `(${newLeads.length - leadsToAdd.length} more available but capped at ${config.maxLeadsPerRun}/run).`
  );

  // 6. Append new leads to Google Sheets.
  try {
    await appendLeads(auth, leadsToAdd);
    console.log(`Done. ${leadsToAdd.length} new lead(s) written to spreadsheet.`);

    // Log a preview table to console for the run log.
    console.log('\nLeads added this run:');
    console.log('─'.repeat(70));
    leadsToAdd.forEach((l, i) => {
      console.log(
        `${String(i + 1).padStart(2)}. ${l.businessName.padEnd(30)} ` +
        `${l.firstName} ${l.lastName}`.padEnd(25) +
        ` ${l.phone}  ${l.city}`
      );
    });
    console.log('─'.repeat(70));
  } catch (err) {
    await sendErrorAlert(
      'Google Sheets write failed',
      `Fetched ${leadsToAdd.length} new lead(s) from Apollo but could not write to the spreadsheet.\n\n` +
      `Error: ${err.message}\n\n` +
      'Check GOOGLE_SHEET_ID permissions and ensure the Google OAuth token has write access.'
    );
  }
}

// ── Scheduler ─────────────────────────────────────────────────
console.log(`HVAC Lead Scraper starting up.`);
console.log(`Cron schedule: ${config.cronSchedule}  (${
  config.cronSchedule === '0 12 * * *' ? '7:00 AM EST / 12:00 UTC' : 'custom'
})`);
console.log(`Max leads per run: ${config.maxLeadsPerRun}`);
console.log(`Target cities: ${config.targetCities.filter(c => !c.startsWith('Saint')).join(', ')}`);
console.log('Waiting for scheduled run time… (Ctrl+C to stop)\n');

cron.schedule(config.cronSchedule, () => {
  runScraper().catch(async err => {
    await sendErrorAlert(
      'Unexpected scraper crash',
      `An unhandled error occurred during the scheduled run.\n\nError: ${err.message}\n${err.stack}`
    );
  });
}, {
  timezone: 'America/New_York',   // ensures cron interprets the schedule in ET
});

// Uncomment to run once immediately on startup (useful for testing):
// runScraper();
