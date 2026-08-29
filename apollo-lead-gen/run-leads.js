/**
 * run-leads.js — Core workflow logic (used by both the scheduler and run-now).
 *
 * Fetches leads from Apollo, deduplicates against the existing sheet,
 * and appends new rows. Returns a result summary object.
 */

const { fetchLeads } = require('./apollo');
const { getSheetsClient, getExistingBusinessNames, ensureHeader, appendLeads } = require('./sheets');
const log = require('./logger');
const config = require('./config');

/**
 * Execute one full lead-gen run.
 * @returns {Promise<{fetched: number, added: number, error: string|null}>}
 */
async function runLeadWorkflow() {
  log.info('═══ Lead generation run starting ═══');
  log.info(`Target cities: ${config.TARGET_CITIES.join(', ')}`);
  log.info(`Max leads per run: ${config.MAX_LEADS_PER_RUN}`);

  const result = { fetched: 0, added: 0, error: null };

  // ── Step 1: Fetch from Apollo ────────────────────────────────────────────────
  let leads;
  try {
    log.info('[apollo] Searching for HVAC leads in Southwest Michigan…');
    leads = await fetchLeads(config.MAX_LEADS_PER_RUN);
    result.fetched = leads.length;
    log.info(`[apollo] Found ${leads.length} qualifying lead(s) after filtering.`);
  } catch (err) {
    log.error('Apollo search', err);
    result.error = `Apollo: ${err.message}`;
    return result;
  }

  if (leads.length === 0) {
    log.warn('[apollo] No results returned — check filters or API quota.');
    result.error = 'Apollo returned 0 results. Check your search filters or remaining API credits.';
    return result;
  }

  // ── Step 2: Write to Google Sheets ──────────────────────────────────────────
  let sheets;
  try {
    log.info('[sheets] Connecting to Google Sheets…');
    sheets = await getSheetsClient();

    await ensureHeader(sheets);
    const existing = await getExistingBusinessNames(sheets);
    log.info(`[sheets] Found ${existing.size} existing business(es) in sheet.`);

    result.added = await appendLeads(sheets, leads, existing);
  } catch (err) {
    log.error('Google Sheets write', err);
    result.error = `Sheets: ${err.message}`;
    return result;
  }

  log.info(`═══ Run complete — ${result.added} new lead(s) added. ═══`);
  return result;
}

module.exports = { runLeadWorkflow };
