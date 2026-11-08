/**
 * Core scraper logic — orchestrates Apollo.io search, deduplication,
 * and Google Sheets append in a single run.
 */

const { searchLeads } = require('./apollo');
const { getExistingBusinessNames, appendLeads, ensureHeaderRow } = require('./sheets');
const { sendErrorNotification } = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Leads';

/**
 * Main entry point. Searches Apollo, deduplicates, and writes to Google Sheets.
 * Sends a notification on any failure rather than crashing the process.
 */
async function runLeadScraper() {
  const runStart = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${runStart}] HVAC Lead Scraper run starting...`);
  console.log(`${'='.repeat(60)}`);

  if (!SPREADSHEET_ID) {
    await sendErrorNotification(
      new Error('GOOGLE_SHEET_ID is not set in .env'),
      'Configuration check'
    );
    return;
  }

  try {
    // 1. Ensure the sheet has a header row (safe to call every run)
    await ensureHeaderRow(SPREADSHEET_ID, SHEET_NAME);

    // 2. Load existing business names to detect duplicates
    console.log('Reading existing leads from Google Sheets...');
    let existingNames;
    try {
      existingNames = await getExistingBusinessNames(SPREADSHEET_ID, SHEET_NAME);
      console.log(`  → ${existingNames.size} existing businesses found.`);
    } catch (err) {
      await sendErrorNotification(err, 'Google Sheets read failed');
      return;
    }

    // 3. Fetch candidates from Apollo.io
    // Fetch 2× the max to have headroom after deduplication
    const fetchTarget = MAX_LEADS * 2;
    console.log(`\nSearching Apollo.io for HVAC leads in SW Michigan...`);
    let rawLeads;
    try {
      rawLeads = await searchLeads(fetchTarget);
    } catch (err) {
      await sendErrorNotification(err, 'Apollo.io search failed');
      return;
    }

    if (!rawLeads || rawLeads.length === 0) {
      await sendErrorNotification(
        new Error('Apollo.io returned 0 results for SW Michigan HVAC search'),
        'No results — check API key, quota, or search filters'
      );
      return;
    }

    console.log(`  → ${rawLeads.length} raw leads fetched from Apollo.`);

    // 4. Remove duplicates (compare on lowercase business name)
    const newLeads = rawLeads
      .filter((lead) => {
        if (!lead.businessName) return false;
        return !existingNames.has(lead.businessName.trim().toLowerCase());
      })
      .slice(0, MAX_LEADS);

    console.log(`  → ${newLeads.length} new unique leads after deduplication.`);

    if (newLeads.length === 0) {
      console.log('No new leads to add — all results already exist in the sheet.');
      console.log('Consider expanding the city list or search filters in lib/apollo.js.');
      return;
    }

    // 5. Append to Google Sheets
    console.log(`\nWriting ${newLeads.length} leads to Google Sheets...`);
    let added;
    try {
      added = await appendLeads(SPREADSHEET_ID, newLeads, SHEET_NAME);
    } catch (err) {
      await sendErrorNotification(err, 'Google Sheets write failed');
      return;
    }

    console.log(`  ✓ ${added} leads written successfully.`);
    console.log(`\n[${new Date().toISOString()}] Run complete.`);

  } catch (err) {
    await sendErrorNotification(err, 'Unexpected error in runLeadScraper');
  }
}

module.exports = { runLeadScraper };
