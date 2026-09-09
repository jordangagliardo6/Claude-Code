/**
 * index.js — Apollo HVAC Lead Generator
 *
 * Pulls HVAC/Plumbing decision-maker leads from Apollo.io and appends
 * new contacts to a Google Sheet — runs on a cron schedule (7 AM Eastern).
 *
 * Usage:
 *   node index.js              — start the scheduler (runs 7 AM ET daily)
 *   node index.js --now        — run one cycle immediately, then exit
 *   node index.js --test       — verify Apollo + Google Sheets connectivity
 */

require('dotenv').config();
const cron = require('node-cron');
const { fetchNewLeads, testConnection: apolloTest } = require('./src/apollo');
const { readExistingNames, writeLeadsToSheet, testConnection: sheetsTest } = require('./src/sheets');
const { sendErrorAlert } = require('./src/mailer');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ── Core run function ─────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const runId = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Apollo HVAC Lead Generator — ${runId}`);
  console.log(`${'─'.repeat(60)}\n`);

  try {
    // 1. Read existing business names from the sheet (for duplicate detection)
    console.log('[1/4] Reading existing leads from Google Sheets…');
    const existingNames = await readExistingNames();
    console.log(`      ${existingNames.size} existing businesses found.\n`);

    // 2. Search Apollo.io for new leads
    console.log(`[2/4] Searching Apollo.io (max ${MAX_LEADS} new leads)…`);
    const newLeads = await fetchNewLeads(existingNames, MAX_LEADS);
    console.log(`      ${newLeads.length} new leads found.\n`);

    if (newLeads.length === 0) {
      console.log('[3/4] Nothing new to write — all results are already in the sheet.\n');
      console.log('[4/4] Done. No changes made.\n');
      return;
    }

    // Log what we found
    console.log('      Leads to add:');
    newLeads.forEach((l, i) => {
      console.log(`        ${i + 1}. ${l.businessName} — ${l.firstName} ${l.lastName} — ${l.phone} — ${l.city}`);
    });
    console.log();

    // 3. Write new rows to the sheet
    console.log('[3/4] Appending to Google Sheets…');
    const written = await writeLeadsToSheet(newLeads);
    console.log(`      ${written} row(s) written successfully.\n`);

    // 4. Summary
    console.log('[4/4] Run complete.');
    console.log(`      Added ${written} lead(s). Sheet now has ${existingNames.size + written} total.\n`);

  } catch (err) {
    const errorMessage = err.stack || err.message;
    console.error('\n[ERROR]', errorMessage, '\n');

    // Send email alert so the user knows to check manually
    await sendErrorAlert(
      `Run failed at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`,
      errorMessage
    );
  }
}

// ── Connection test ───────────────────────────────────────────────────────────

async function runConnectionTest() {
  console.log('\n─────────────────────────────────────────────────────');
  console.log('  Apollo HVAC Lead Generator — Connection Test');
  console.log('─────────────────────────────────────────────────────\n');

  const [apollo, sheets] = await Promise.all([apolloTest(), sheetsTest()]);

  const icon = (ok) => (ok ? '✓' : '✗');
  console.log(`  Apollo.io       ${icon(apollo.ok)}  ${apollo.message}`);
  console.log(`  Google Sheets   ${icon(sheets.ok)}  ${sheets.message}\n`);

  if (apollo.ok && sheets.ok) {
    console.log('  Both connections verified. You are ready to run.\n');
    console.log('  • Start the daily scheduler:  node index.js');
    console.log('  • Run once right now:          node index.js --now\n');
    process.exit(0);
  } else {
    console.log('  One or more connections failed. Fix the errors above, then re-run --test.\n');
    process.exit(1);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test')) {
  runConnectionTest();

} else if (args.includes('--now')) {
  // One-shot immediate run
  runLeadGeneration().then(() => process.exit(0)).catch((err) => {
    console.error('Unexpected top-level error:', err);
    process.exit(1);
  });

} else {
  // Default: start the cron scheduler
  // Cron expression: "0 7 * * *" = 7:00 AM every day
  // Timezone: America/New_York (Eastern Time — handles DST automatically)
  const schedule = '0 7 * * *';

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('  Apollo HVAC Lead Generator — Scheduler Starting');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Schedule : ${schedule}  (7:00 AM Eastern Time, daily)`);
  console.log(`  Max leads: ${MAX_LEADS} per run`);
  console.log(`  Started  : ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
  console.log('─────────────────────────────────────────────────────────────');
  console.log('\n  Waiting for next scheduled run… (Ctrl+C to stop)\n');

  cron.schedule(schedule, runLeadGeneration, {
    timezone: 'America/New_York',
  });
}
