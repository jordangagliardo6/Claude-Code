/**
 * index.js — HVAC Lead Generation Scheduler
 *
 * Runs daily at 7:00 AM Eastern Time.
 * Each run pulls up to MAX_LEADS_PER_RUN new HVAC leads from Apollo.io
 * and appends them to your Google Sheet, skipping any business already listed.
 *
 * Usage:
 *   node index.js            — start the scheduler (runs at 7am ET every day)
 *   node index.js --run-now  — run once immediately (use this for testing)
 *   node verify.js           — verify API connections before first scheduled run
 */

require('dotenv').config();

const cron  = require('node-cron');
const { fetchHVACLeads }          = require('./src/apollo');
const { getExistingBusinessNames, appendLeads } = require('./src/sheets');
const { notifyError }             = require('./src/notify');

const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ── Validation ────────────────────────────────────────────────────────────────

function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_KEY'];
  const missing  = required.filter(k => !process.env[k]);

  if (missing.length > 0) {
    console.error('\n[FATAL] Missing required environment variables:');
    missing.forEach(k => console.error(`  - ${k}`));
    console.error('\nCopy .env.example → .env, fill in your values, then try again.\n');
    process.exit(1);
  }
}

// ── Main run ──────────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const runTime = new Date().toISOString();
  console.log(`\n[${ runTime }] ── HVAC Lead Gen Run ───────────────────────────`);

  try {
    // Step 1: Read existing sheet to get business names for dedup
    console.log('\n[1/4] Reading existing leads from Google Sheets...');
    const existing = await getExistingBusinessNames();
    console.log(`  ${existing.size} businesses already in the sheet.`);

    // Step 2: Fetch leads from Apollo
    // Fetch more than MAX to have a pool after duplicates are removed
    const fetchTarget = Math.min(MAX_LEADS_PER_RUN * 4, 100);
    console.log(`\n[2/4] Searching Apollo.io (fetching up to ${fetchTarget} candidates)...`);
    const rawLeads = await fetchHVACLeads(fetchTarget);

    if (rawLeads.length === 0) {
      console.log('\n  Apollo returned 0 leads with phone numbers.');
      console.log('  This may mean:\n    - Your filters are too narrow\n    - API key issue\n    - Apollo has no phone data for this area right now');
      await notifyError(new Error(`Apollo returned 0 leads on run at ${runTime}. Check filters or API key.`));
      return;
    }

    console.log(`  ${rawLeads.length} contacts found with phone numbers.`);

    // Step 3: Remove businesses already in the sheet
    console.log('\n[3/4] Deduplicating...');
    const newLeads = rawLeads.filter(lead => {
      const key = lead.businessName.trim().toLowerCase();
      return key && !existing.has(key);
    });
    const dupCount = rawLeads.length - newLeads.length;
    console.log(`  ${dupCount} duplicate(s) removed. ${newLeads.length} new lead(s) to add.`);

    if (newLeads.length === 0) {
      console.log('  All returned leads are already in the sheet. Nothing added.');
      console.log('────────────────────────────────────────────────────────────\n');
      return;
    }

    // Step 4: Append up to MAX_LEADS_PER_RUN rows
    const toAdd = newLeads.slice(0, MAX_LEADS_PER_RUN);
    const held  = newLeads.length - toAdd.length;

    console.log(`\n[4/4] Writing ${toAdd.length} lead(s) to Google Sheets...`);
    await appendLeads(toAdd);

    console.log(`\n  ✓ Done.`);
    console.log(`    Added    : ${toAdd.length}`);
    if (held > 0) console.log(`    Held back: ${held} (will appear in a future run)`);
    console.log(`    Sheet total: ${existing.size + toAdd.length}`);

  } catch (err) {
    console.error(`\n[ERROR] Run failed: ${err.message}`);
    await notifyError(err);
  }

  console.log('────────────────────────────────────────────────────────────\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────

validateEnv();

if (process.argv.includes('--run-now')) {
  runLeadGeneration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';

  console.log('\n[HVAC Lead Gen] Scheduler started.');
  console.log(`  Schedule    : ${schedule}  (timezone: America/New_York)`);
  console.log(`  Leads / run : ${MAX_LEADS_PER_RUN} max`);
  console.log('\n  Commands:');
  console.log('    node verify.js           — test both API connections');
  console.log('    node index.js --run-now  — run immediately\n');

  cron.schedule(schedule, runLeadGeneration, {
    timezone: 'America/New_York',
  });
}
