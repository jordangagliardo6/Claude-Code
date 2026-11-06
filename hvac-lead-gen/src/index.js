/**
 * HVAC Lead Generation Workflow
 *
 * Searches Apollo.io for HVAC owner-operators in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends new leads.
 *
 * Schedule: every day at 7:00 AM Eastern Time
 * Max per run: controlled by MAX_LEADS_PER_RUN in .env (default 25)
 *
 * Usage:
 *   node src/index.js            → starts the cron scheduler
 *   node src/index.js --test     → verifies API connections and exits
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHVACLeads } = require('./apollo');
const { getExistingBusinessNames, appendLeads, verifyConnection } = require('./sheets');
const { notifyError, log } = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ─── Main workflow ────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  log('Starting HVAC lead generation run...');

  // 1. Pull up to MAX_LEADS candidates from Apollo
  let rawLeads;
  try {
    rawLeads = await searchHVACLeads(MAX_LEADS);
    log(`Apollo returned ${rawLeads.length} candidate lead(s)`);
  } catch (err) {
    await notifyError('Apollo search failed', err);
    return;
  }

  if (rawLeads.length === 0) {
    await notifyError('Apollo returned zero results', 'No leads matched the search criteria. Check Apollo filters or API quota.');
    return;
  }

  // 2. Load existing business names from the sheet for dedup
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames();
    log(`Sheet has ${existingNames.size} existing business(es) — checking for duplicates`);
  } catch (err) {
    await notifyError('Google Sheets read failed', err);
    return;
  }

  // 3. Filter out duplicates (case-insensitive match on Business Name)
  const newLeads = rawLeads.filter(lead => {
    const key = lead.businessName.trim().toLowerCase();
    return key && !existingNames.has(key);
  });

  log(`${newLeads.length} new lead(s) after removing ${rawLeads.length - newLeads.length} duplicate(s)`);

  if (newLeads.length === 0) {
    log('Nothing to append — all leads already exist in the sheet.');
    return;
  }

  // 4. Append new leads to the sheet
  try {
    const appended = await appendLeads(newLeads);
    log(`Successfully appended ${appended} new lead(s) to Google Sheet.`);
  } catch (err) {
    await notifyError('Google Sheets write failed', err);
  }
}

// ─── Connection test (--test flag) ───────────────────────────────────────────

async function runConnectionTest() {
  console.log('\n=== HVAC Lead Gen — Connection Test ===\n');

  // Test Apollo
  process.stdout.write('1. Testing Apollo.io API key... ');
  try {
    const leads = await searchHVACLeads(1);
    console.log(`OK — API responded, found ${leads.length} sample result(s)`);
  } catch (err) {
    console.log(`FAILED\n   → ${err.message}`);
    console.log('\n[!] Apollo connection failed. Check APOLLO_API_KEY in your .env file.\n');
    process.exit(1);
  }

  // Test Google Sheets
  process.stdout.write('2. Testing Google Sheets connection... ');
  try {
    const info = await verifyConnection();
    console.log(`OK — Connected to "${info.title}"`);
    console.log(`   Tabs found: ${info.sheets?.join(', ')}`);
  } catch (err) {
    console.log(`FAILED\n   → ${err.message}`);
    console.log('\n[!] Google Sheets connection failed. Check GOOGLE_CREDENTIALS_PATH');
    console.log('    and make sure you shared the sheet with your service account email.\n');
    process.exit(1);
  }

  console.log('\n✓ Both connections verified. You are ready to run the scheduler.\n');
  console.log('Start the scheduler with:  node src/index.js');
  console.log('Or run one cycle now:      FORCE_RUN=1 node src/index.js\n');
  process.exit(0);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test')) {
  runConnectionTest().catch(err => {
    console.error('Unexpected error during test:', err);
    process.exit(1);
  });
} else if (process.env.FORCE_RUN === '1') {
  // Run immediately (useful for manual one-shot execution)
  runLeadGeneration().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  // Start the scheduler — 7:00 AM Eastern every day
  log('Scheduler started. Next run: 7:00 AM Eastern Time.');
  log(`Settings: MAX_LEADS_PER_RUN=${MAX_LEADS}, SPREADSHEET_ID=${process.env.SPREADSHEET_ID}`);

  cron.schedule(
    '0 7 * * *',
    () => {
      runLeadGeneration().catch(async err => {
        await notifyError('Unhandled error in lead gen run', err);
      });
    },
    { timezone: 'America/New_York' }
  );

  // Keep the process alive
  process.on('SIGINT', () => {
    log('Scheduler stopped.');
    process.exit(0);
  });
}
