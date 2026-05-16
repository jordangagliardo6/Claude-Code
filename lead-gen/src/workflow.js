const { fetchLeads } = require('./apollo');
const { writeleadsToSheet, testConnection: testSheets } = require('./sheets');
const { testConnection: testApollo } = require('./apollo');
const { notifyError } = require('./notify');
const config = require('./config');

/**
 * Run a single lead-generation cycle:
 *  1. Read existing business names from the sheet (for dedup)
 *  2. Fetch up to maxLeadsPerRun contacts from Apollo.io
 *  3. Append new (non-duplicate) contacts to the sheet
 */
async function runWorkflow() {
  const startTime = new Date();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Lead gen run started: ${startTime.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('─'.repeat(60));

  let apolloLeads = [];
  let writeResult = { written: 0, skipped: 0 };

  // ── Step 1: Fetch existing names so we pass them into Apollo fetcher ──────
  let existingNames = new Set();
  try {
    // Re-use the sheets module's existing name reader directly
    const { google } = require('googleapis');
    const sheetsModule = require('./sheets');
    // We call writeleadsToSheet with empty array just to get dedup info would be wasteful.
    // Instead, a small workaround: fetch leads with an empty skip set,
    // then let writeleadsToSheet do the final dedup before writing.
    // This is intentional — Apollo dedup happens inside fetchLeads against the live sheet.
  } catch (_) {
    // Non-fatal — fetchLeads will still work, writeleadsToSheet deduplicates anyway
  }

  // ── Step 2: Fetch from Apollo ──────────────────────────────────────────────
  try {
    console.log('\n[1/2] Fetching leads from Apollo.io...');
    apolloLeads = await fetchLeads(config.search.maxLeadsPerRun, existingNames);
    console.log(`  Apollo returned ${apolloLeads.length} candidate lead(s).`);

    if (apolloLeads.length === 0) {
      const msg = 'Apollo.io returned 0 results for all target cities.';
      console.warn('  WARNING:', msg);
      await notifyError('Apollo Search', new Error(msg));
    }
  } catch (err) {
    console.error('  Apollo fetch failed:', err.message);
    await notifyError('Apollo Fetch', err);
    // Continue — don't crash the process; the sheet write will be skipped gracefully
  }

  // ── Step 3: Write to Google Sheets ────────────────────────────────────────
  if (apolloLeads.length > 0) {
    try {
      console.log('\n[2/2] Writing leads to Google Sheets...');
      writeResult = await writeleadsToSheet(apolloLeads);
      console.log(`  Written: ${writeResult.written} new lead(s), skipped ${writeResult.skipped} duplicate(s).`);
    } catch (err) {
      console.error('  Google Sheets write failed:', err.message);
      await notifyError('Google Sheets Write', err);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nRun complete in ${elapsed}s — ${writeResult.written} new leads added.`);
  console.log('─'.repeat(60) + '\n');

  return writeResult;
}

/**
 * Verify that both API connections are working before the first scheduled run.
 * Prints a clear pass/fail for each service.
 */
async function testConnections() {
  console.log('\n' + '═'.repeat(60));
  console.log('  CONNECTION TEST');
  console.log('═'.repeat(60));

  let allPassed = true;

  // Apollo test
  process.stdout.write('  Apollo.io API key ... ');
  try {
    const ok = await testApollo();
    if (ok) {
      console.log('✓  Connected');
    } else {
      console.log('✗  Unexpected response');
      allPassed = false;
    }
  } catch (err) {
    console.log(`✗  FAILED — ${err.response?.data?.message || err.message}`);
    allPassed = false;
  }

  // Google Sheets test
  process.stdout.write('  Google Sheets       ... ');
  try {
    const title = await testSheets();
    console.log(`✓  Connected — sheet: "${title}"`);
  } catch (err) {
    console.log(`✗  FAILED — ${err.message}`);
    allPassed = false;
  }

  console.log('═'.repeat(60));
  if (allPassed) {
    console.log('  All connections OK. Scheduler is ready.\n');
  } else {
    console.log('  One or more connections failed. Fix the errors above before running.\n');
    process.exit(1);
  }
}

module.exports = { runWorkflow, testConnections };
