// Core lead generation workflow — runs once per scheduled invocation.

const { fetchLeads } = require('./apolloClient');
const { getExistingBusinessNames, appendRows, leadToRow } = require('./sheetsClient');

// Logs a timestamped message to stdout.
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Main workflow function. Returns a result summary object.
async function runLeadGenWorkflow(config) {
  log('=== HVAC Lead Gen — run started ===');

  // ── Step 1: Pull candidate leads from Apollo ──────────────────────────────
  log(`Searching Apollo for HVAC leads in: ${config.cities.join(', ')}`);
  let apolloLeads;

  try {
    apolloLeads = await fetchLeads(config);
    log(`Apollo returned ${apolloLeads.length} candidate lead(s) with phone numbers.`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    log(`ERROR — ${msg}`);
    throw new Error(msg);
  }

  if (apolloLeads.length === 0) {
    log('No leads with phone numbers found. Ending run without writing to sheet.');
    return { added: 0, skipped: 0, message: 'Apollo returned no usable leads.' };
  }

  // ── Step 2: Load existing Business Names from Google Sheets ───────────────
  log('Reading existing business names from Google Sheets to check for duplicates…');
  let existingNames;

  try {
    existingNames = await getExistingBusinessNames(config);
    log(`Sheet contains ${existingNames.size} existing business(es).`);
  } catch (err) {
    const msg = `Google Sheets read failed: ${err.message}`;
    log(`ERROR — ${msg}`);
    throw new Error(msg);
  }

  // ── Step 3: Filter out duplicates ─────────────────────────────────────────
  const newLeads = apolloLeads.filter((lead) => {
    const key = lead.businessName.trim().toLowerCase();
    return key && !existingNames.has(key);
  });

  const skipped = apolloLeads.length - newLeads.length;
  log(`Duplicate check: ${newLeads.length} new, ${skipped} already in sheet.`);

  if (newLeads.length === 0) {
    log('All leads already exist in sheet. Nothing to add.');
    return { added: 0, skipped, message: 'All leads were duplicates.' };
  }

  // ── Step 4: Append new leads (up to maxLeadsPerRun) ───────────────────────
  const toAdd = newLeads.slice(0, config.apollo.maxLeadsPerRun);
  const rows = toAdd.map(leadToRow);

  try {
    await appendRows(rows, config);
    log(`Successfully appended ${toAdd.length} new lead(s) to Google Sheets.`);
    toAdd.forEach((lead, i) => {
      log(`  ${i + 1}. ${lead.businessName} (${lead.city}) — ${lead.phone}`);
    });
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    log(`ERROR — ${msg}`);
    throw new Error(msg);
  }

  log('=== Run complete ===');
  return { added: toAdd.length, skipped, message: `Added ${toAdd.length} new lead(s).` };
}

module.exports = { runLeadGenWorkflow };
