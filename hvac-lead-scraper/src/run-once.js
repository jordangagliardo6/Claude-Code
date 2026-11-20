/**
 * Manual one-shot run — use this to test or trigger a run outside the schedule.
 * Usage: node src/run-once.js
 */

require('dotenv').config();
const { fetchLeads } = require('./scraper');
const { appendLeads } = require('./sheets');
const { notifyError, notifySuccess } = require('./notify');
const config = require('./config');

async function run() {
  const startTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n========================================`);
  console.log(`HVAC Lead Scraper — Run started`);
  console.log(`Time: ${startTime} (Eastern)`);
  console.log(`Max leads this run: ${config.maxLeadsPerRun}`);
  console.log(`========================================\n`);

  let leads = [];
  let added = 0;

  try {
    // Step 1: Fetch from Apollo.io
    leads = await fetchLeads(config.maxLeadsPerRun);

    if (leads.length === 0) {
      const msg = 'Apollo.io returned 0 results. Check your API key, filters, or remaining credits.';
      console.warn(`[Warning] ${msg}`);
      await notifyError('Apollo returned no results', new Error(msg));
      return;
    }

    console.log(`\n[Run] Fetched ${leads.length} lead(s) from Apollo. Writing to sheet...\n`);
  } catch (err) {
    console.error('[Run] Apollo fetch failed:', err.message);
    await notifyError('Apollo.io fetch', err);
    process.exit(1);
  }

  try {
    // Step 2: Append to Google Sheet (deduplication handled inside)
    added = await appendLeads(leads);
    const skipped = leads.length - added;

    console.log(`\n========================================`);
    console.log(`Run complete.`);
    console.log(`  New leads added : ${added}`);
    console.log(`  Duplicates skipped: ${skipped}`);
    console.log(`========================================\n`);

    await notifySuccess(added, skipped, leads.length);
  } catch (err) {
    console.error('[Run] Google Sheets write failed:', err.message);
    await notifyError('Google Sheets write', err);
    process.exit(1);
  }
}

run();
