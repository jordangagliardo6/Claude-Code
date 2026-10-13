/**
 * index.js — HVAC Lead Generation Automation
 *
 * Searches Apollo.io for HVAC / plumbing / mechanical company owners in
 * Southwest Michigan, deduplicates against an existing Google Sheet, and
 * appends up to MAX_LEADS_PER_RUN new leads daily at 7 AM Eastern.
 *
 * Usage:
 *   node index.js              — start the daily 7 AM scheduler
 *   node index.js --now        — run immediately (first-run test)
 *   node index.js --verify     — verify API connections without writing anything
 *
 * Required env vars (copy .env.example → .env and fill in):
 *   APOLLO_API_KEY, GOOGLE_SPREADSHEET_ID, GOOGLE_CREDENTIALS_PATH
 */

require('dotenv').config();
const cron = require('node-cron');

const { searchPeople, enrichPerson, personToLead } = require('./apollo');
const { getSheetsClient, getExistingBusinessNames, appendLeads, verifySheet } = require('./sheets');
const { logError, logSuccess } = require('./notify');
const config = require('./config');

// ─── Environment Checks ───────────────────────────────────────────────────────

function checkEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in your credentials.'
    );
  }
}

const SPREADSHEET_ID = () => process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME     = () => process.env.SHEET_NAME || 'Sheet1';

// ─── Verify Mode (--verify flag) ──────────────────────────────────────────────

async function runVerify() {
  console.log('\n── HVAC Lead Scraper — Connection Verification ──────────────────\n');

  // 1. Apollo
  console.log('1/2  Checking Apollo.io API key...');
  try {
    checkEnv();
    const people = await searchPeople(process.env.APOLLO_API_KEY);
    console.log(`     ✓ Apollo connected — ${people.length} result(s) returned in test search`);
  } catch (err) {
    console.error(`     ✗ Apollo FAILED: ${err.response?.data?.error || err.message}`);
    process.exit(1);
  }

  // 2. Google Sheets
  console.log('2/2  Checking Google Sheets access...');
  try {
    const sheets = await getSheetsClient();
    const result = await verifySheet(sheets, SPREADSHEET_ID(), SHEET_NAME());

    if (result.mismatched.length === 0) {
      console.log(`     ✓ Google Sheets connected — header row looks correct`);
    } else {
      console.warn(`     ⚠ Google Sheets connected but header mismatch: ${result.mismatched.join(', ')}`);
      console.warn(`       Expected: ${result.expected.join(' | ')}`);
      console.warn(`       Found:    ${result.header.join(' | ')}`);
    }
  } catch (err) {
    console.error(`     ✗ Google Sheets FAILED: ${err.message}`);
    process.exit(1);
  }

  console.log('\n── All checks passed. Safe to start the scheduler. ─────────────\n');
  console.log('  Run:  node index.js --now   ← test run (adds up to 25 leads)');
  console.log('  Run:  node index.js         ← start the 7 AM daily scheduler\n');
}

// ─── Main Lead Generation Workflow ───────────────────────────────────────────

async function runLeadGeneration() {
  const startTs = new Date().toISOString();
  console.log(`\n[${startTs}] ── HVAC Lead Scraper starting ──────────────────────────\n`);

  checkEnv();

  const apiKey        = process.env.APOLLO_API_KEY;
  const spreadsheetId = SPREADSHEET_ID();
  const sheetName     = SHEET_NAME();

  // ── Step 1: Connect to Google Sheets ────────────────────────────────────
  let sheets;
  try {
    sheets = await getSheetsClient();
    console.log('[1/4] Google Sheets connected');
  } catch (err) {
    await logError('Could not connect to Google Sheets', err);
    return;
  }

  // ── Step 2: Load existing business names (duplicate check) ────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);
    console.log(`[2/4] Loaded ${existingNames.size} existing leads from sheet`);
  } catch (err) {
    await logError('Failed to read existing leads from Google Sheets', err);
    return;
  }

  // ── Step 3: Search Apollo for new leads ──────────────────────────────
  let rawPeople;
  try {
    rawPeople = await searchPeople(apiKey);
    console.log(`[3/4] Apollo returned ${rawPeople.length} candidate(s)`);
  } catch (err) {
    await logError(
      'Apollo search failed — check APOLLO_API_KEY and network',
      err.response ? new Error(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`) : err
    );
    return;
  }

  if (rawPeople.length === 0) {
    await logError('Apollo returned 0 results — filters may be too narrow', new Error('No results'));
    return;
  }

  // ── Step 4: Filter, enrich phones, deduplicate, collect new leads ─────
  const newLeads = [];
  let skipped    = 0;

  for (const person of rawPeople) {
    if (newLeads.length >= config.maxLeadsPerRun) break;

    let lead = personToLead(person);

    // Skip if no company name
    if (!lead.businessName) { skipped++; continue; }

    // Duplicate check (case-insensitive)
    const key = lead.businessName.toLowerCase().trim();
    if (existingNames.has(key)) {
      console.log(`  → skip (duplicate): ${lead.businessName}`);
      skipped++;
      continue;
    }

    // If phone is missing from search results, enrich via Apollo (costs 1 credit)
    if (!lead.phone && person.id) {
      try {
        const enriched = await enrichPerson(apiKey, person.id);
        if (enriched) lead = personToLead(enriched);
      } catch (err) {
        console.warn(`  → enrich failed for ${lead.businessName}: ${err.message}`);
      }
    }

    // Exclude contacts with no phone number (per requirements)
    if (!lead.phone) {
      console.log(`  → skip (no phone): ${lead.businessName}`);
      skipped++;
      continue;
    }

    newLeads.push(lead);
    console.log(`  + queued: ${lead.businessName} — ${lead.ownerFirstName} ${lead.ownerLastName} — ${lead.phone} (${lead.city})`);
  }

  console.log(`\n[4/4] ${newLeads.length} new lead(s) ready, ${skipped} skipped`);

  // ── Write to Google Sheets ────────────────────────────────────────────
  if (newLeads.length === 0) {
    console.log('      Nothing new to write — all results were duplicates or had no phone.');
    logSuccess(0, skipped);
    return;
  }

  try {
    const written = await appendLeads(sheets, spreadsheetId, sheetName, newLeads);
    const endTs   = new Date().toISOString();
    console.log(`\n[${endTs}] ✓ Done — wrote ${written} new lead(s) to Google Sheets`);
    logSuccess(written, skipped);
  } catch (err) {
    await logError('Failed to write leads to Google Sheets', err);
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  // Connection test — no writes
  runVerify().catch(err => {
    console.error('Verify error:', err.message);
    process.exit(1);
  });

} else if (args.includes('--now')) {
  // Immediate one-shot run
  runLeadGeneration().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });

} else {
  // Daily scheduler — 7:00 AM Eastern Time
  cron.schedule('0 7 * * *', () => {
    runLeadGeneration().catch(err =>
      logError('Unhandled error in scheduled run', err)
    );
  }, {
    scheduled: true,
    timezone:  'America/New_York',
  });

  console.log('HVAC Lead Scraper is running.');
  console.log('Scheduled for 7:00 AM Eastern Time every day.');
  console.log('Press Ctrl+C to stop.\n');
  console.log('Tip: run "node index.js --verify" first to confirm both APIs are connected.');
}
