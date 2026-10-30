'use strict';

/**
 * Main orchestration: search Apollo → deduplicate → append to Google Sheets.
 *
 * Called by both scheduler.js (automatic daily runs) and run.js (manual runs).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const apollo   = require('./apollo');
const sheets   = require('./sheets');
const notifier = require('./notifier');

// ─── Config from environment ──────────────────────────────────────────────────

function loadConfig() {
  const required = [
    'APOLLO_API_KEY',
    'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
    'GOOGLE_SPREADSHEET_ID',
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in your credentials.'
    );
  }

  return {
    apolloKey:     process.env.APOLLO_API_KEY,
    keyFile:       process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    tabName:       process.env.GOOGLE_SHEET_TAB || 'Sheet1',
    maxLeads:      parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  };
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Remove any leads whose business name already appears in the sheet.
 * Matching is case-insensitive and strips extra whitespace.
 *
 * @param {Array}  candidates  - Leads from Apollo
 * @param {Set}    existing    - Set of lowercase business names from the sheet
 * @returns {{ newLeads: Array, skipped: number }}
 */
function deduplicateLeads(candidates, existing) {
  const newLeads = [];
  let skipped = 0;

  for (const lead of candidates) {
    const key = lead.businessName.trim().toLowerCase();
    if (existing.has(key)) {
      skipped++;
    } else {
      newLeads.push(lead);
      // Add to set so we don't insert the same business twice within one run
      // (Apollo can return the same org via different city queries)
      existing.add(key);
    }
  }

  return { newLeads, skipped };
}

// ─── Main run ─────────────────────────────────────────────────────────────────

/**
 * Execute one full lead-generation run.
 * Returns a summary object; throws on fatal errors.
 */
async function run() {
  const cfg = loadConfig();

  console.log(`\n=== HVAC Lead Gen — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET ===`);
  console.log(`Max leads this run: ${cfg.maxLeads}`);

  // 1. Ensure header row exists (safe no-op if already present)
  await sheets.ensureHeaderRow(cfg.keyFile, cfg.spreadsheetId, cfg.tabName);

  // 2. Load existing business names to prevent duplicates
  console.log('\nReading existing leads from Google Sheets…');
  const existing = await sheets.readExistingBusinessNames(cfg.keyFile, cfg.spreadsheetId, cfg.tabName);
  console.log(`  Found ${existing.size} existing businesses in the sheet.`);

  // 3. Search Apollo for new leads
  console.log('\nSearching Apollo.io…');
  const candidates = await apollo.searchLeads(cfg.apolloKey, cfg.maxLeads * 2);
  // Fetch extra so dedup still yields cfg.maxLeads after filtering
  console.log(`  Apollo returned ${candidates.length} candidates with phone numbers.`);

  if (candidates.length === 0) {
    throw new Error(
      'Apollo returned 0 results. ' +
      'Check your APOLLO_API_KEY and ensure your account has People Search access.'
    );
  }

  // 4. Deduplicate
  const { newLeads, skipped } = deduplicateLeads(candidates, existing);
  console.log(`\nDedup: ${newLeads.length} new, ${skipped} already in sheet.`);

  // Honour the per-run cap after dedup
  const toInsert = newLeads.slice(0, cfg.maxLeads);

  // 5. Write new leads to Google Sheets
  if (toInsert.length === 0) {
    notifier.logSuccess(0, skipped);
    return { added: 0, skipped };
  }

  console.log(`\nAppending ${toInsert.length} leads to Google Sheets…`);
  await sheets.appendLeads(cfg.keyFile, cfg.spreadsheetId, cfg.tabName, toInsert);

  notifier.logSuccess(toInsert.length, skipped);
  return { added: toInsert.length, skipped };
}

module.exports = { run };
