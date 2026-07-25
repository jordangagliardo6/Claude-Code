'use strict';

/**
 * Core run logic — searches Apollo, deduplicates against the sheet,
 * and appends new leads. Separated from the scheduler so it can be
 * called directly (--once flag) or tested without the cron job.
 */

const ApolloClient      = require('./apollo');
const GoogleSheetsClient = require('./sheets');
const { getGoogleAuth } = require('./auth');
const { notifyError }   = require('./notify');
const {
  TARGET_CITIES,
  MAX_LEADS_PER_RUN,
} = require('./config');

async function run() {
  const runId   = new Date().toISOString();
  const dateStr = runId.slice(0, 10); // "YYYY-MM-DD"

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Apollo Lead Gen — Run started at ${runId}`);
  console.log('═'.repeat(60));

  // ── Init clients ────────────────────────────────────────────────────────────
  let apollo, sheetsClient;
  try {
    apollo = new ApolloClient(process.env.APOLLO_API_KEY);

    const auth = await getGoogleAuth();
    sheetsClient = new GoogleSheetsClient(
      auth,
      process.env.GOOGLE_SPREADSHEET_ID,
      process.env.GOOGLE_SHEET_TAB ?? 'Leads'
    );
  } catch (err) {
    await notifyError('Startup failed', err.message);
    return { added: 0, skipped: 0, error: err.message };
  }

  // ── Ensure sheet has headers ─────────────────────────────────────────────────
  try {
    await sheetsClient.ensureHeaders();
  } catch (err) {
    await notifyError('Could not access Google Sheet', err.message);
    return { added: 0, skipped: 0, error: err.message };
  }

  // ── Load existing business names for dedup ──────────────────────────────────
  let existingNames;
  try {
    existingNames = await sheetsClient.getExistingBusinessNames();
    console.log(`\n[Sheets] ${existingNames.size} existing businesses in sheet.`);
  } catch (err) {
    await notifyError('Could not read existing leads from Google Sheet', err.message);
    return { added: 0, skipped: 0, error: err.message };
  }

  // ── Search Apollo city by city ──────────────────────────────────────────────
  const newLeads = [];
  let skippedDupes = 0;
  let apolloError  = null;

  for (const city of TARGET_CITIES) {
    if (newLeads.length >= MAX_LEADS_PER_RUN) break;

    const remaining = MAX_LEADS_PER_RUN - newLeads.length;

    let cityLeads;
    try {
      cityLeads = await apollo.searchLeadsForCity(city, remaining * 2); // fetch extra to account for dupes
    } catch (err) {
      apolloError = `Apollo search failed for "${city}": ${err.message}`;
      console.error(`  [Apollo] ERROR: ${apolloError}`);
      continue; // Try next city instead of aborting the whole run
    }

    for (const lead of cityLeads) {
      if (newLeads.length >= MAX_LEADS_PER_RUN) break;

      const key = lead.businessName.trim().toLowerCase();
      if (!key) continue; // Skip leads with no business name

      if (existingNames.has(key)) {
        skippedDupes++;
        continue;
      }

      newLeads.push(lead);
      existingNames.add(key); // Prevent dupes within this same run
    }
  }

  console.log(`\n[Runner] ${newLeads.length} new leads / ${skippedDupes} duplicates skipped`);

  if (newLeads.length === 0 && apolloError) {
    await notifyError(
      'Apollo returned no results',
      `All city searches failed. Last error:\n${apolloError}\n\n` +
      'Check your APOLLO_API_KEY and that your plan has available credits.'
    );
    return { added: 0, skipped: skippedDupes, error: apolloError };
  }

  if (newLeads.length === 0) {
    console.log('[Runner] No new leads this run — all results were duplicates.');
    return { added: 0, skipped: skippedDupes };
  }

  // ── Write to Google Sheet ───────────────────────────────────────────────────
  let added;
  try {
    added = await sheetsClient.appendLeads(newLeads, dateStr);
  } catch (err) {
    await notifyError(
      'Google Drive write failed',
      `Found ${newLeads.length} new leads but could not write to the sheet.\n` +
      `Error: ${err.message}`
    );
    return { added: 0, skipped: skippedDupes, error: err.message };
  }

  console.log(`\n✅  Run complete — ${added} leads added to sheet.`);
  console.log('─'.repeat(60));

  // If Apollo had partial errors during the run, log them (non-fatal)
  if (apolloError) {
    console.warn(`\n⚠️  Note: Some city searches failed. Last error: ${apolloError}`);
  }

  return { added, skipped: skippedDupes };
}

module.exports = { run };
