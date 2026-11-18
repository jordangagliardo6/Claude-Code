const { searchHVACLeads } = require('./apollo');
const { appendNewLeads } = require('./sheets');
const { config, validateConfig } = require('./config');

// Runs one full lead generation cycle:
// 1. Pulls up to maxLeads contacts from Apollo
// 2. Deduplicates against the existing sheet
// 3. Appends new rows
// Returns a result summary object.
async function runLeadGeneration() {
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Starting HVAC lead generation run...`);

  try {
    validateConfig();
  } catch (err) {
    logError('Configuration error', err);
    return { success: false, error: err.message };
  }

  let leads = [];
  try {
    console.log(`[Apollo] Searching for HVAC leads in Southwest Michigan (max ${config.maxLeadsPerRun})...`);
    leads = await searchHVACLeads(config.maxLeadsPerRun);
    console.log(`[Apollo] Found ${leads.length} lead(s) with phone numbers.`);
  } catch (err) {
    logError('Apollo search failed', err);
    return { success: false, error: err.message, phase: 'apollo' };
  }

  if (leads.length === 0) {
    console.warn('[Apollo] No leads returned. Check your search filters or API quota.');
    return { success: true, fetched: 0, added: 0, skipped: 0 };
  }

  let result;
  try {
    console.log('[Sheets] Writing leads to Google Sheets...');
    result = await appendNewLeads(leads);
    console.log(`[Sheets] Done — ${result.added} added, ${result.skipped} skipped (duplicates or no name).`);
  } catch (err) {
    logError('Google Sheets write failed', err);
    return { success: false, error: err.message, phase: 'sheets', fetched: leads.length };
  }

  const summary = {
    success: true,
    runAt: startedAt,
    fetched: leads.length,
    added: result.added,
    skipped: result.skipped,
  };

  console.log('[Done]', JSON.stringify(summary));
  return summary;
}

function logError(context, err) {
  console.error(`[ERROR] ${context}: ${err.message}`);
  if (err.stack) console.error(err.stack);
}

module.exports = { runLeadGeneration };
