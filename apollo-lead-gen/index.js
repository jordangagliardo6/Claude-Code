/**
 * index.js — Entry point for the HVAC lead generation scheduler.
 *
 * Schedules a daily run at 7:00 AM Eastern Time.
 * Each run:
 *   1. Searches Apollo.io for HVAC/plumbing decision-makers in SW Michigan
 *   2. Filters to contacts with phone numbers
 *   3. De-duplicates against the existing Google Sheet
 *   4. Appends up to 25 new leads
 *
 * Usage:
 *   node index.js           → Start the scheduler (keeps running)
 *   node index.js --now     → Also trigger one run immediately
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHVACLeads, mapToLead, sortByTitlePriority } = require('./apollo');
const { appendLeads } = require('./sheets');
const { logError } = require('./notify');
const config = require('./config');

// ── Env validation ──────────────────────────────────────────────────────────
function validateEnv() {
  const missing = [];
  if (!process.env.APOLLO_API_KEY) missing.push('APOLLO_API_KEY');
  if (!process.env.GOOGLE_SHEET_ID) missing.push('GOOGLE_SHEET_ID');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Copy .env.example to .env and fill in your values.`
    );
  }
}

// ── Main run ────────────────────────────────────────────────────────────────
async function runLeadGen() {
  const startTime = new Date().toISOString();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`HVAC Lead Gen — ${startTime}`);
  console.log(`${'═'.repeat(60)}`);

  try {
    validateEnv();

    let allLeads = [];
    let page = 1;
    let apolloTotal = 0;

    // Fetch pages from Apollo until we have maxLeadsPerRun candidates with phones
    while (allLeads.length < config.maxLeadsPerRun) {
      console.log(`\n  [Apollo] Searching page ${page}...`);

      const data = await searchHVACLeads(page);
      const people = data.people || [];
      apolloTotal += people.length;

      if (people.length === 0) {
        console.log('  [Apollo] No more results.');
        break;
      }

      // Map to internal format; mapToLead returns null for contacts without phones
      const mapped = people.map(mapToLead).filter(Boolean);

      // Narrow to SW Michigan target cities.
      // Apollo's location filter already biases toward Michigan, but Apollo profiles
      // may have a broader location string — we tighten it here.
      const inTargetArea = mapped.filter((lead) => {
        if (!lead.city) return true; // include if city is blank (Apollo didn't populate it)
        return config.targetCities.some((city) =>
          lead.city.toLowerCase().includes(city.toLowerCase())
        );
      });

      console.log(
        `  [Apollo] Page ${page}: ${people.length} results → ` +
        `${mapped.length} with phone → ${inTargetArea.length} in target cities`
      );

      allLeads.push(...inTargetArea);
      page++;

      // Apollo returns < per_page results on the last page
      if (people.length < 25) break;

      // Polite 500 ms pause between pages
      await sleep(500);
    }

    if (allLeads.length === 0) {
      await logError(
        'NO_RESULTS',
        'Apollo returned no leads with phone numbers in SW Michigan for this run. ' +
        'Check your Apollo plan credits or broaden the city list in config.js.'
      );
      return;
    }

    // Sort by job title priority (Owner first, then President, etc.)
    const prioritized = sortByTitlePriority(allLeads);

    // Cap to max leads per run
    const leadsToWrite = prioritized.slice(0, config.maxLeadsPerRun);

    console.log(`\n  [Sheets] Writing up to ${leadsToWrite.length} leads...`);

    const result = await appendLeads(leadsToWrite);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Run complete`);
    console.log(`  New leads added    : ${result.appended}`);
    console.log(`  Duplicates skipped : ${result.duplicates}`);
    console.log(`  Apollo pages read  : ${page - 1} (${apolloTotal} contacts scanned)`);
    console.log(`${'─'.repeat(60)}\n`);

  } catch (err) {
    await logError('RUN_ERROR', err.message || String(err));
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────
validateEnv(); // Fail fast at startup rather than silently at 7am

cron.schedule(config.cronSchedule, runLeadGen, {
  timezone: config.cronTimezone,
});

console.log(`\n${'═'.repeat(60)}`);
console.log(` HVAC Lead Gen Scheduler — Started`);
console.log(`${'═'.repeat(60)}`);
console.log(` Schedule  : ${config.cronSchedule} (${config.cronTimezone})`);
console.log(` Cities    : ${config.targetCities.join(', ')}`);
console.log(` Max leads : ${config.maxLeadsPerRun} per run`);
console.log(` Sheet tab : ${config.sheetTab}`);
console.log(`\n Runs daily at 7:00 AM Eastern. Press Ctrl+C to stop.\n`);

// --now flag: trigger one run immediately in addition to scheduling
if (process.argv.includes('--now')) {
  console.log(' --now flag detected: running immediately...\n');
  runLeadGen();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
