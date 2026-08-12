'use strict';

/**
 * SW Michigan HVAC Lead Generation — Scheduled Runner
 *
 * Default schedule: 7:00 AM Eastern Time, every day
 * Run once now:   node index.js --run-now
 * Test connections: node index.js --test
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchHvacLeads, enrichWithPhoneNumbers, normalizeLead } = require('./src/apollo');
const { getExistingBusinessNames, ensureHeader, appendLeads } = require('./src/sheets');
const { notifyError } = require('./src/notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ─── Core workflow ────────────────────────────────────────────────────────────

async function runWorkflow() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Lead Gen] Starting run at ${new Date().toISOString()}`);
  console.log(`[Lead Gen] Max leads this run: ${MAX_LEADS}`);
  console.log('='.repeat(60));

  try {
    // 1. Fetch existing business names so we can skip duplicates
    await ensureHeader();
    const existingNames = await getExistingBusinessNames();

    // 2. Search Apollo for HVAC owners in SW Michigan
    const rawPeople = await searchHvacLeads(MAX_LEADS);
    if (!rawPeople.length) {
      console.log('[Lead Gen] Apollo returned 0 results. Nothing to process.');
      await notifyError(
        'Apollo returned 0 results',
        `The Apollo People Search returned no results.\n\nFilters used:\n- Industry: HVAC / Heating / Plumbing / Mechanical\n- Employees: 1–25\n- Locations: SW Michigan cities\n- Titles: Owner, President, Founder, Co-Founder, GM\n\nPossible causes:\n- Apollo API key is on the wrong plan (needs Basic or higher)\n- Search filters are too narrow — try broadening city list in src/apollo.js`
      );
      return;
    }

    // 3. Enrich contacts to reveal phone numbers
    const enriched = await enrichWithPhoneNumbers(rawPeople);
    if (!enriched.length) {
      console.log('[Lead Gen] No contacts with phone numbers found after enrichment.');
      return;
    }

    // 4. Normalize, deduplicate against the sheet, and filter to max
    const newLeads = [];
    for (const person of enriched) {
      if (newLeads.length >= MAX_LEADS) break;

      const lead = normalizeLead(person);

      // Skip if no phone or no business name
      if (!lead.phone || !lead.businessName) continue;

      // Skip duplicates
      if (existingNames.has(lead.businessName.toLowerCase())) {
        console.log(`[Lead Gen] Skipping duplicate: ${lead.businessName}`);
        continue;
      }

      newLeads.push(lead);
    }

    // 5. Write new leads to Google Sheets
    if (!newLeads.length) {
      console.log('[Lead Gen] All contacts were duplicates or lacked required fields.');
      return;
    }

    const written = await appendLeads(newLeads);
    console.log(`\n[Lead Gen] Done. ${written} new lead(s) added to Google Sheets.`);
    console.log(`[Lead Gen] Spreadsheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID}/edit`);
  } catch (err) {
    console.error('[Lead Gen] WORKFLOW ERROR:', err.message);
    console.error(err.stack);

    // Send notification email
    await notifyError(`Workflow failed: ${err.message}`, err.stack || err.message);
  }
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnections() {
  console.log('\n[Test] Checking environment variables...');

  const required = [
    'APOLLO_API_KEY',
    'GOOGLE_SPREADSHEET_ID',
    'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
  ];
  let allSet = true;
  for (const key of required) {
    if (process.env[key]) {
      console.log(`  ✓ ${key} is set`);
    } else {
      console.log(`  ✗ ${key} is MISSING`);
      allSet = false;
    }
  }

  if (!allSet) {
    console.log('\n[Test] Copy .env.example → .env and fill in your values, then re-run.');
    process.exit(1);
  }

  console.log('\n[Test] Checking Google Sheets connection...');
  try {
    const { ensureHeader, getExistingBusinessNames } = require('./src/sheets');
    await ensureHeader();
    const existing = await getExistingBusinessNames();
    console.log(`  ✓ Google Sheets connected — ${existing.size} existing row(s)`);
  } catch (err) {
    console.error(`  ✗ Google Sheets failed: ${err.message}`);
    process.exit(1);
  }

  console.log('\n[Test] Checking Apollo.io API key...');
  const axios = require('axios');
  try {
    const res = await axios.get('https://api.apollo.io/v1/auth/health', {
      params: { api_key: process.env.APOLLO_API_KEY },
      timeout: 10_000,
    });
    if (res.data?.is_logged_in) {
      console.log('  ✓ Apollo.io connected — API key is valid');
    } else {
      console.log('  ✗ Apollo.io: API key returned is_logged_in = false');
      process.exit(1);
    }
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error(`  ✗ Apollo.io failed: ${msg}`);
    process.exit(1);
  }

  console.log('\n[Test] All connections OK. You can now run: node index.js --run-now');
  console.log(`[Test] Or start the scheduler:        node index.js`);
  console.log(`[Test] Scheduled time: ${process.env.CRON_SCHEDULE || '0 12 * * *'} UTC = 7 AM ET\n`);
  process.exit(0);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test')) {
  testConnections();
} else if (args.includes('--run-now')) {
  // One-shot run (no scheduler)
  runWorkflow().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  // Scheduler mode
  const schedule = process.env.CRON_SCHEDULE || '0 12 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[Cron] Invalid cron expression: "${schedule}"`);
    process.exit(1);
  }

  console.log(`[Cron] Scheduler started. Pattern: "${schedule}" (UTC)`);
  console.log('[Cron] Waiting for next scheduled run...');
  console.log('[Cron] Ctrl+C to stop. Run node index.js --run-now to trigger immediately.');

  cron.schedule(schedule, () => {
    runWorkflow().catch((err) => console.error('[Cron] Unhandled error in workflow:', err));
  }, {
    timezone: 'America/New_York', // Apply Eastern Time directly
  });
}
