/**
 * index.js — Entry point for the HVAC lead generation workflow.
 *
 * Usage:
 *   node index.js               — starts the scheduler (runs daily at 7am ET)
 *   node index.js --test        — runs a one-time connection test and exits
 *   node index.js --run-now     — runs a lead pull immediately, then exits
 */
require('dotenv').config();
const cron = require('node-cron');
const { searchHvacLeads } = require('./apollo');
const { getExistingBusinessNames, appendLeadsToSheet } = require('./sheets');
const { notifyError } = require('./notify');
const config = require('./config');

const args = process.argv.slice(2);
const TEST_MODE = args.includes('--test');
const RUN_NOW = args.includes('--run-now');

// ─── Core workflow ────────────────────────────────────────────────────────────

async function runLeadPull() {
  const runId = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${runId}] Lead pull starting...`);

  try {
    // Step 1 — load existing business names from the sheet
    const existing = await getExistingBusinessNames();

    // Step 2 — fetch leads from Apollo
    const rawLeads = await searchHvacLeads(config.MAX_LEADS_PER_RUN + existing.size);

    // Step 3 — deduplicate against the sheet
    const newLeads = rawLeads.filter(
      l => !existing.has(l.businessName.toLowerCase().trim())
    ).slice(0, config.MAX_LEADS_PER_RUN);

    console.log(`[Run] ${rawLeads.length} total from Apollo → ${newLeads.length} new after dedup`);

    if (newLeads.length === 0) {
      console.log('[Run] No new leads to add. Sheet is up to date.');
      return;
    }

    // Step 4 — append to Google Sheet
    await appendLeadsToSheet(newLeads);

    console.log(`[Run] ✅ Done. Added ${newLeads.length} leads on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })}.`);
  } catch (err) {
    console.error('[Run] ❌ Workflow failed:', err.message);
    await notifyError(err);
  }
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function runConnectionTest() {
  console.log('\n=== HVAC Lead Gen — Connection Test ===\n');
  let allPassed = true;

  // Test 1: Apollo API key present
  process.stdout.write('1. Apollo API key configured... ');
  if (process.env.APOLLO_API_KEY) {
    console.log('✅');
  } else {
    console.log('❌  APOLLO_API_KEY not found in .env');
    allPassed = false;
  }

  // Test 2: Google credentials configured
  process.stdout.write('2. Google credentials configured... ');
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    console.log('✅');
  } else {
    console.log('❌  Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE in .env');
    allPassed = false;
  }

  // Test 3: Google Sheets read (live)
  process.stdout.write('3. Google Sheets read (live)... ');
  try {
    const names = await getExistingBusinessNames();
    console.log(`✅  (${names.size} existing rows read)`);
  } catch (err) {
    console.log(`❌  ${err.message}`);
    allPassed = false;
  }

  // Test 4: Apollo API call (live — may fail on free plan)
  process.stdout.write('4. Apollo API reachable... ');
  try {
    const leads = await searchHvacLeads(1);
    console.log(`✅  (${leads.length} lead returned)`);
  } catch (err) {
    if (err.message.includes('paid') || err.message.includes('denied') || err.message.includes('plan')) {
      console.log(`⚠️  Apollo requires a paid plan: ${err.message}`);
      console.log('   → Upgrade at https://www.apollo.io/pricing (Basic plan or above)');
      console.log('   → Sheets integration is still functional; only Apollo is blocked.');
    } else {
      console.log(`❌  ${err.message}`);
    }
    allPassed = false;
  }

  console.log('\n' + (allPassed ? '✅ All checks passed. Ready to run.' : '⚠️  Fix the items above, then run again.'));
  process.exit(allPassed ? 0 : 1);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (TEST_MODE) {
  runConnectionTest();
} else if (RUN_NOW) {
  runLeadPull().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  // Start the scheduler
  console.log(`[Scheduler] HVAC lead gen scheduler started.`);
  console.log(`[Scheduler] Will run at 7:00am Eastern every day.`);
  console.log(`[Scheduler] Max ${config.MAX_LEADS_PER_RUN} new leads per run.`);
  console.log(`[Scheduler] Target sheet: https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}/edit`);

  cron.schedule(config.CRON_SCHEDULE, runLeadPull, {
    timezone: config.CRON_TIMEZONE,
  });

  // Run once immediately on startup to confirm connectivity
  console.log('\n[Startup] Running initial lead pull to confirm connectivity...');
  runLeadPull();
}
