// ─────────────────────────────────────────────────────────────────
// index.js — Main entry point.
//
// Two modes:
//   node src/index.js           → start scheduler (runs daily at 7am ET)
//   node src/index.js --test    → run once immediately and exit
//                                 (use this to confirm everything is wired up)
// ─────────────────────────────────────────────────────────────────

require('dotenv').config();

const cron   = require('node-cron');
const { searchLeads }             = require('./apollo');
const { getSheets, getExistingBusinessNames, appendLeads } = require('./sheets');
const { sendErrorNotification }   = require('./notify');
const config = require('./config');

// ── Core workflow ─────────────────────────────────────────────────

async function runLeadGenWorkflow() {
  const startTime = new Date();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${startTime.toISOString()}] HVAC Lead Gen — run started`);
  console.log(`${'─'.repeat(60)}`);

  try {

    // Step 1: Pull candidates from Apollo ─────────────────────────
    console.log('\n[1/4] Searching Apollo.io...');
    console.log(`      Cities:    ${config.cities.join(', ')}`);
    console.log(`      Titles:    ${config.jobTitles.join(', ')}`);
    console.log(`      Employees: 1–25`);

    const candidates = await searchLeads();
    console.log(`      ↳ ${candidates.length} candidate(s) returned with a phone number`);

    if (candidates.length === 0) {
      const msg = 'Apollo search returned 0 contacts with phone numbers. '
        + 'Check your API key, Apollo plan tier (phone reveal), and search filters.';
      console.warn(`\n[WARN] ${msg}`);
      await sendErrorNotification(msg);
      return;
    }

    // Step 2: Connect to Google Sheets ────────────────────────────
    console.log('\n[2/4] Connecting to Google Sheets...');
    const sheets = await getSheets();
    console.log('      ↳ Connected');

    // Step 3: Load existing names and deduplicate ──────────────────
    console.log('\n[3/4] Checking for duplicates...');
    const existingNames = await getExistingBusinessNames(sheets);
    console.log(`      ↳ Sheet already has ${existingNames.size} unique business(es)`);

    const newLeads = candidates
      .filter((lead) => {
        const key = lead.businessName.trim().toLowerCase();
        return key.length > 0 && !existingNames.has(key);
      })
      .slice(0, config.maxLeadsPerRun); // respect the per-run cap

    const duplicateCount = candidates.length - newLeads.length;
    if (duplicateCount > 0) {
      console.log(`      ↳ Skipped ${duplicateCount} duplicate(s) already in the sheet`);
    }

    if (newLeads.length === 0) {
      console.log('\n[INFO] No new leads to add this run — all results are already in the sheet.');
      return;
    }

    // Step 4: Write new leads to the sheet ─────────────────────────
    console.log(`\n[4/4] Writing ${newLeads.length} new lead(s) to Google Sheet...`);
    const written = await appendLeads(sheets, newLeads);

    console.log(`\n✓ Done — ${written} lead(s) added:`);
    newLeads.forEach((l, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${l.businessName}`
        + ` | ${l.firstName} ${l.lastName}`
        + ` | ${l.phone}`
        + ` | ${l.city}`);
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sendErrorNotification(message);
    // Signal failure to the OS (useful if running under systemd or PM2)
    process.exitCode = 1;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[${new Date().toISOString()}] Run finished in ${elapsed}s`);
}

// ── Entry point ────────────────────────────────────────────────────

const isTest = process.argv.includes('--test');

if (isTest) {
  // ── Test / first-run mode ──────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log(' HVAC Lead Gen — CONNECTION TEST');
  console.log(' This will run the full workflow once and exit.');
  console.log('═══════════════════════════════════════════════════════');
  runLeadGenWorkflow().then(() => {
    if (process.exitCode === 1) {
      console.log('\n[TEST] Run finished WITH ERRORS — fix the issues above before scheduling.');
    } else {
      console.log('\n[TEST] Run finished successfully!');
      console.log('[TEST] Start the scheduler with: npm start');
    }
    process.exit(process.exitCode ?? 0);
  });

} else {
  // ── Scheduler mode ────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log(' HVAC Lead Gen — SCHEDULER RUNNING');
  console.log(`  Schedule : ${config.cronSchedule} (${config.cronTimezone})`);
  console.log(`  Next run : ${getNextRunDescription()}`);
  console.log('  Tip      : run with --test to execute immediately');
  console.log('═══════════════════════════════════════════════════════');

  cron.schedule(config.cronSchedule, runLeadGenWorkflow, {
    scheduled: true,
    timezone: config.cronTimezone,
  });

  // Keep the process alive and handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[SCHEDULER] Received SIGINT — shutting down cleanly.');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('\n[SCHEDULER] Received SIGTERM — shutting down cleanly.');
    process.exit(0);
  });
}

function getNextRunDescription() {
  const [, hour, , , ] = config.cronSchedule.split(' ');
  return `${hour}:00 ${config.cronTimezone} every day`;
}
