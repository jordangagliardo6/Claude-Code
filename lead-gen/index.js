'use strict';

// Load .env variables before anything else
require('dotenv').config();

const cron = require('node-cron');
const config = require('./config');
const { searchLeads } = require('./apollo');
const {
  getSheetsClient,
  verifyConnection,
  ensureHeaders,
  getExistingBusinessNames,
  appendLeads,
} = require('./sheets');
const { notifyError } = require('./notify');

// --test flag: run once immediately and exit (used to confirm setup before
// the first scheduled run). Does NOT skip any real logic — it's the full run.
const IS_TEST = process.argv.includes('--test');

// ─── Core run logic ──────────────────────────────────────────────────────────

async function runLeadGen() {
  const runStart = new Date();
  console.log(`\n[${ runStart.toISOString() }] ── Starting HVAC lead gen run ──`);

  // 1. Connect to Google Sheets
  let sheets;
  try {
    sheets = await getSheetsClient();
    const sheetTitle = await verifyConnection(sheets, process.env.GOOGLE_SHEET_ID);
    console.log(`  ✓ Google Sheets connected  →  "${sheetTitle}"`);
  } catch (err) {
    await notifyError(`Google Sheets connection failed: ${err.message}`);
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = config.SHEET_TAB;

  // 2. Set up headers (no-op if they already exist)
  try {
    await ensureHeaders(sheets, spreadsheetId, tab, config.SHEET_COLUMNS);
  } catch (err) {
    // Non-fatal: log a warning and continue
    console.warn(`  ⚠  Could not verify headers: ${err.message}`);
  }

  // 3. Load existing business names to prevent duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets, spreadsheetId, tab);
    console.log(`  ✓ ${existingNames.size} existing leads loaded from sheet`);
  } catch (err) {
    await notifyError(`Failed to read existing leads from sheet: ${err.message}`);
    return;
  }

  // 4. Search Apollo — fetch extra candidates so we still hit MAX_LEADS_PER_RUN
  //    after filtering out duplicates and contacts without phones.
  const fetchLimit = config.MAX_LEADS_PER_RUN * 3;
  let rawLeads;
  try {
    rawLeads = await searchLeads(config, fetchLimit);
    console.log(`  ✓ Apollo returned ${rawLeads.length} contacts with phone numbers`);
  } catch (err) {
    await notifyError(`Apollo search failed: ${err.message}`);
    return;
  }

  if (rawLeads.length === 0) {
    const msg = 'Apollo returned 0 results. Check your search parameters or API quota.';
    console.warn(`  ⚠  ${msg}`);
    await notifyError(msg);
    return;
  }

  // 5. Deduplicate against what's already in the sheet, then trim to cap
  const newLeads = rawLeads
    .filter(lead => {
      if (!lead.businessName) return false;
      return !existingNames.has(lead.businessName.toLowerCase().trim());
    })
    .slice(0, config.MAX_LEADS_PER_RUN);

  console.log(`  ✓ ${newLeads.length} new (non-duplicate) leads to add`);

  if (newLeads.length === 0) {
    console.log('  Nothing new to add — all Apollo results are already in the sheet.');
    console.log(`  Run finished in ${ elapsedSeconds(runStart) }s.\n`);
    return;
  }

  // 6. Append new leads to Google Sheets
  try {
    const added = await appendLeads(sheets, spreadsheetId, tab, newLeads);
    console.log(`  ✓ ${added} leads appended to sheet`);
  } catch (err) {
    await notifyError(`Failed to write leads to Google Sheet: ${err.message}`);
    return;
  }

  console.log(`  Run finished in ${ elapsedSeconds(runStart) }s.\n`);
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function runConnectionTest() {
  console.log('\n' + '═'.repeat(60));
  console.log('  CONNECTION TEST — verifying Apollo.io + Google Sheets');
  console.log('═'.repeat(60));

  // Check env vars before touching any API
  const missing = validateEnv();
  if (missing.length) {
    console.error(`\nMissing required variables: ${missing.join(', ')}`);
    console.error('Fill these in .env and try again.\n');
    process.exit(1);
  }

  console.log('\n[1/2] Testing Google Sheets connection…');
  let sheets;
  try {
    sheets = await getSheetsClient();
    const title = await verifyConnection(sheets, process.env.GOOGLE_SHEET_ID);
    console.log(`  ✓ Connected to sheet: "${title}"`);
  } catch (err) {
    console.error(`  ✗ Google Sheets failed: ${err.message}`);
    console.error('\nCheck GOOGLE_CREDENTIALS_PATH and that the service account has');
    console.error('Editor access to the sheet at GOOGLE_SHEET_ID.\n');
    process.exit(1);
  }

  console.log('\n[2/2] Testing Apollo.io connection (pulling 1 sample lead)…');
  try {
    const sample = await searchLeads(config, 1);
    if (sample.length > 0) {
      const l = sample[0];
      console.log(`  ✓ Apollo returned at least 1 result:`);
      console.log(`      Business : ${l.businessName || '(no name)'}`);
      console.log(`      Contact  : ${l.firstName} ${l.lastName}`);
      console.log(`      Phone    : ${l.phone}`);
      console.log(`      City     : ${l.city}`);
    } else {
      console.log('  ✓ Apollo responded but returned 0 contacts with phone numbers.');
      console.log('    The API is reachable. Try broadening city or industry filters.');
    }
  } catch (err) {
    console.error(`  ✗ Apollo failed: ${err.message}`);
    console.error('\nCheck that APOLLO_API_KEY is valid and your plan supports people search.\n');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  Both connections OK.');
  console.log('  Running full lead gen pass now…');
  console.log('═'.repeat(60) + '\n');

  // Run a full pass so the user sees real output before activating the cron
  await runLeadGen();

  console.log('First run complete. To activate the daily 7 AM schedule, run:');
  console.log('  npm start\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_CREDENTIALS_PATH'];
  return required.filter(k => !process.env[k]);
}

function elapsedSeconds(start) {
  return ((Date.now() - start.getTime()) / 1000).toFixed(1);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

if (IS_TEST) {
  runConnectionTest().catch(err => {
    console.error('Unexpected error during test:', err);
    process.exit(1);
  });
} else {
  // Validate env on startup so misconfiguration is caught immediately
  const missing = validateEnv();
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env, fill in all values, then restart.');
    process.exit(1);
  }

  // Cron expression: "0 7 * * *" = every day at 07:00
  cron.schedule('0 7 * * *', () => {
    runLeadGen().catch(err => notifyError(`Unhandled scheduler error: ${err.message}`));
  }, {
    timezone: 'America/New_York',
  });

  console.log('HVAC Lead Gen scheduler running.');
  console.log('Next run: 7:00 AM Eastern Time. Press Ctrl+C to stop.');
}
