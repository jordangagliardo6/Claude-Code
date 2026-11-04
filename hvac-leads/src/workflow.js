'use strict';

const config = require('./config');
const apollo = require('./apollo');
const sheets = require('./sheets');

/**
 * Run one full lead generation cycle:
 *   1. Pull up to MAX_LEADS_PER_RUN leads from Apollo.io
 *   2. Remove any businesses already in the sheet
 *   3. Append the new leads
 *   4. Return a summary object
 */
async function runWorkflow() {
  config.validateEnv();

  const startedAt = new Date().toISOString();
  console.log(`\n[${startedAt}] Starting HVAC lead generation run…`);

  // ── Step 1: Fetch leads from Apollo ────────────────────────────────────────
  console.log('  Fetching leads from Apollo.io…');
  let fetched;
  try {
    fetched = await apollo.searchLeads(config.MAX_LEADS_PER_RUN * 2); // over-fetch to survive dedup
  } catch (err) {
    throw new Error(`Apollo fetch failed: ${err.message}`);
  }
  console.log(`  Apollo returned ${fetched.length} leads with phone numbers.`);

  if (!fetched.length) {
    console.log('  No leads returned — nothing to write. Run complete.');
    return { added: 0, skipped: 0, reason: 'apollo_empty' };
  }

  // ── Step 2: Authenticate with Google Sheets ────────────────────────────────
  console.log('  Authenticating with Google Sheets…');
  let auth;
  try {
    auth = await sheets.getAuthClient();
  } catch (err) {
    throw new Error(`Google auth failed: ${err.message}`);
  }

  // ── Step 3: Ensure header row exists ──────────────────────────────────────
  await sheets.ensureHeader(auth);

  // ── Step 4: Fetch existing business names to avoid duplicates ────────────
  console.log('  Reading existing entries from sheet…');
  let existingNames;
  try {
    existingNames = await sheets.fetchExistingBusinessNames(auth);
  } catch (err) {
    throw new Error(`Sheet read failed: ${err.message}`);
  }
  console.log(`  Found ${existingNames.size} existing business(es) in sheet.`);

  // ── Step 5: Filter out duplicates ────────────────────────────────────────
  const newLeads = fetched.filter(
    (lead) => !existingNames.has(lead.businessName.toLowerCase().trim())
  );
  const skipped = fetched.length - newLeads.length;
  console.log(`  ${newLeads.length} new | ${skipped} duplicate(s) skipped.`);

  if (!newLeads.length) {
    console.log('  All results already in sheet — nothing to write.');
    return { added: 0, skipped, reason: 'all_duplicates' };
  }

  // ── Step 6: Trim to per-run limit and append ──────────────────────────────
  const toWrite = newLeads.slice(0, config.MAX_LEADS_PER_RUN);
  console.log(`  Writing ${toWrite.length} lead(s) to sheet…`);

  let added;
  try {
    added = await sheets.appendLeads(toWrite, auth);
  } catch (err) {
    throw new Error(`Sheet write failed: ${err.message}`);
  }

  const finishedAt = new Date().toISOString();
  console.log(`[${finishedAt}] Done. Added ${added} lead(s), skipped ${skipped} duplicate(s).\n`);

  return { added, skipped, reason: 'success' };
}

// Allow direct execution: `node src/workflow.js`
if (require.main === module) {
  runWorkflow().catch((err) => {
    console.error(`\nFATAL: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runWorkflow };
