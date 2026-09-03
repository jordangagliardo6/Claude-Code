/**
 * Main workflow
 *
 * Orchestrates: Apollo search → deduplicate → append to Sheets → notify
 */

const { searchLeads } = require('./apollo');
const { ensureHeaders, appendLeads } = require('./sheets');
const { notifySuccess, notifyError } = require('./notify');

/**
 * Run one full cycle of the lead generation workflow.
 *
 * @param {Object} opts
 * @param {number} opts.maxLeads  - Maximum leads to pull (default 25)
 * @param {boolean} opts.dryRun  - If true, print leads but do NOT write to Sheets
 */
async function runWorkflow({ maxLeads = 25, dryRun = false } = {}) {
  const label = dryRun ? '[DRY RUN] ' : '';
  console.log(`\n${label}HVAC Lead Gen — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('─'.repeat(60));

  let leads = [];

  // 1. Pull leads from Apollo
  try {
    console.log(`\nSearching Apollo.io (max ${maxLeads} leads)...`);
    leads = await searchLeads(maxLeads);
    console.log(`Found ${leads.length} qualified leads.`);
  } catch (err) {
    await notifyError(err, 'Apollo.io search');
    return;
  }

  if (leads.length === 0) {
    await notifyError(
      new Error('Apollo returned 0 results — check your API key, filters, or credit balance.'),
      'Apollo.io search'
    );
    return;
  }

  // 2. Dry-run mode: print and exit
  if (dryRun) {
    console.log('\nLeads found (dry run — not written to Sheets):');
    leads.forEach((l, i) => {
      console.log(
        `  ${i + 1}. ${l.businessName} | ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city} | ${l.website}`
      );
    });
    return;
  }

  // 3. Ensure spreadsheet has header row
  try {
    await ensureHeaders();
  } catch (err) {
    await notifyError(err, 'Google Sheets — ensure headers');
    return;
  }

  // 4. Append new leads (sheets.js handles duplicate checking)
  let stats;
  try {
    console.log('\nWriting to Google Sheets...');
    stats = await appendLeads(leads);
  } catch (err) {
    await notifyError(err, 'Google Sheets — append leads');
    return;
  }

  // 5. Report results
  await notifySuccess({ ...stats, totalSearched: leads.length });
}

module.exports = { runWorkflow };
