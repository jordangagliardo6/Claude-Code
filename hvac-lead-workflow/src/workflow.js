/**
 * Core workflow: pull HVAC leads from Apollo, dedup against the sheet,
 * append new ones, and return a summary.
 *
 * Called by the cron job in index.js.
 */

const { searchHvacLeads, normalizePerson } = require('./apollo');
const { getSheetsClient, getExistingBusinessNames, appendLeads } = require('./sheets');

/**
 * Run one full lead-generation cycle.
 *
 * @param {object} config
 * @param {string} config.apolloApiKey
 * @param {string} config.spreadsheetId
 * @param {string} config.credentialsPath
 * @param {string} config.tokenPath
 * @param {number} config.maxLeads         Max new leads to add this run
 * @returns {{ added: number, skipped: number, total: number, leads: Array }}
 */
async function runWorkflow(config) {
  const { apolloApiKey, spreadsheetId, credentialsPath, tokenPath, maxLeads } = config;

  console.log(`[${new Date().toISOString()}] Starting HVAC lead workflow...`);

  // --- Step 1: Connect to Google Sheets ---
  console.log('Connecting to Google Sheets...');
  const sheetsClient = await getSheetsClient(credentialsPath, tokenPath);
  const existingNames = await getExistingBusinessNames(sheetsClient, spreadsheetId);
  console.log(`Sheet has ${existingNames.size} existing businesses (dedup check ready).`);

  // --- Step 2: Pull from Apollo ---
  console.log(`Searching Apollo for SW Michigan HVAC leads (requesting up to ${maxLeads})...`);
  let apolloData;
  try {
    // Request slightly more than maxLeads so dupes don't leave us short
    apolloData = await searchHvacLeads(apolloApiKey, Math.min(maxLeads * 2, 100), 1);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    throw new Error(`Apollo search failed: ${msg}`);
  }

  const rawPeople = apolloData.people || apolloData.contacts || [];
  console.log(`Apollo returned ${rawPeople.length} raw results.`);

  if (rawPeople.length === 0) {
    console.log('Apollo returned no results. Check API key, plan level, and search filters.');
    return { added: 0, skipped: 0, total: 0, leads: [] };
  }

  // --- Step 3: Normalize, filter no-phone, dedup ---
  const newLeads = [];
  let skipped = 0;

  for (const person of rawPeople) {
    if (newLeads.length >= maxLeads) break;

    const lead = normalizePerson(person);
    if (!lead) {
      skipped++;
      continue; // No phone number — skip
    }
    if (!lead.businessName) {
      skipped++;
      continue; // No company name — skip
    }
    if (existingNames.has(lead.businessName.toLowerCase().trim())) {
      skipped++;
      continue; // Already in sheet
    }

    newLeads.push(lead);
    existingNames.add(lead.businessName.toLowerCase().trim()); // Prevent intra-batch dupes
  }

  console.log(
    `After dedup: ${newLeads.length} new leads to add, ${skipped} skipped (no phone or duplicate).`
  );

  // --- Step 4: Append to sheet ---
  if (newLeads.length > 0) {
    const added = await appendLeads(sheetsClient, spreadsheetId, newLeads);
    console.log(`Appended ${added} rows to sheet.`);
    return { added, skipped, total: rawPeople.length, leads: newLeads };
  }

  console.log('No new leads to add this run.');
  return { added: 0, skipped, total: rawPeople.length, leads: [] };
}

module.exports = { runWorkflow };
