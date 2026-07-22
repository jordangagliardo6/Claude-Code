/**
 * index.js — HVAC Lead Generation Scheduler
 *
 * Runs automatically every day at 7:00am Eastern Time.
 * Searches Apollo.io for HVAC owner-operators in Southwest Michigan,
 * enriches their phone numbers, and appends new leads to Google Sheets.
 *
 * Usage:
 *   node index.js           → start the scheduler (keeps running)
 *   node index.js --run-now → also fire one run immediately (for testing)
 *   node index.js --verify  → test API connections only, no data written
 */

require('dotenv').config();

const cron = require('node-cron');
const config = require('./src/config');
const { searchHVACPeople, bulkRevealPhones, extractBestPhone, extractWebsite } = require('./src/apollo');
const { ensureHeaderRow, getExistingBusinessNames, appendLeads } = require('./src/sheets');
const { notifyError } = require('./src/notify');

// ── Core Run ──────────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const runId = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`HVAC Lead Gen  |  ${runId}`);
  console.log('='.repeat(60));

  try {
    // ── Step 1: Prep the sheet ──────────────────────────────────────────────
    console.log('\n[1/5] Connecting to Google Sheets…');
    await ensureHeaderRow();
    const existingNames = await getExistingBusinessNames();
    console.log(`  ✓ ${existingNames.size} existing businesses found (will skip duplicates)`);

    // ── Step 2: Search Apollo ──────────────────────────────────────────────
    console.log('\n[2/5] Searching Apollo.io for HVAC leads in Southwest Michigan…');
    const rawCandidates = await fetchEnoughCandidates(existingNames);

    if (!rawCandidates.length) {
      const msg = `Apollo search returned 0 new candidates across ${config.maxSearchPages} pages.`;
      console.warn('  ⚠ ' + msg);
      await notifyError('No Apollo results', msg + `\n\nRun: ${runId}`);
      return;
    }
    console.log(`  ✓ ${rawCandidates.length} new candidates to enrich`);

    // ── Step 3: Enrich phone numbers ───────────────────────────────────────
    console.log('\n[3/5] Enriching phone numbers (this may take ~30–60 seconds)…');
    let enriched = [];
    try {
      enriched = await bulkRevealPhones(rawCandidates);
      console.log(`  ✓ Enrichment complete — ${enriched.length} people returned`);
    } catch (err) {
      console.error('  ✗ Phone enrichment error:', err.message);
      await notifyError('Phone Enrichment Failed', `${err.message}\n\nRun: ${runId}`);
      // Continue — we'll write 0 leads instead of crashing
    }

    // ── Step 4: Build qualified lead list ──────────────────────────────────
    console.log('\n[4/5] Filtering to leads with confirmed phone numbers…');
    const leads = buildLeadList(enriched, existingNames);
    console.log(`  ✓ ${leads.length} qualified leads (had phone + not duplicate)`);

    if (!leads.length) {
      const msg = `Found ${rawCandidates.length} new candidates but none had a phone number after enrichment.`;
      console.warn('  ⚠ ' + msg);
      await notifyError('No Phone Numbers Found', msg + `\n\nRun: ${runId}`);
      return;
    }

    // ── Step 5: Write to Google Sheets ─────────────────────────────────────
    console.log(`\n[5/5] Appending ${leads.length} leads to Google Sheets…`);
    try {
      const written = await appendLeads(leads);
      console.log(`  ✓ SUCCESS — ${written} new leads added to the spreadsheet`);
    } catch (err) {
      console.error('  ✗ Google Sheets write failed:', err.message);
      await notifyError(
        'Google Sheets Write Failed',
        `Failed to write ${leads.length} leads.\nError: ${err.message}\nRun: ${runId}`
      );
    }

  } catch (err) {
    console.error('\n[FATAL]', err.message);
    await notifyError(
      'Lead Gen Run Crashed',
      `Unexpected error: ${err.message}\n\nStack:\n${err.stack}\n\nRun: ${runId}`
    );
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Page through Apollo search results until we have enough NEW candidates
 * (not already in the sheet) to fill the maxLeadsPerRun quota.
 * Stops early if Apollo runs out of results.
 */
async function fetchEnoughCandidates(existingNames) {
  const needed = config.maxLeadsPerRun;
  const newCandidates = [];

  for (let page = 1; page <= config.maxSearchPages; page++) {
    console.log(`  › Fetching page ${page}…`);
    const people = await searchHVACPeople(page, 50);

    if (!people.length) {
      console.log(`  › No more results at page ${page}. Stopping.`);
      break;
    }

    for (const person of people) {
      const bizName = (person.organization_name || '').trim();
      if (!bizName) continue;
      if (existingNames.has(bizName.toLowerCase())) continue; // duplicate
      newCandidates.push(person);
      if (newCandidates.length >= needed) break;
    }

    console.log(`  › ${newCandidates.length}/${needed} new candidates collected`);
    if (newCandidates.length >= needed) break;
  }

  return newCandidates;
}

/**
 * Convert enriched Apollo people into clean lead objects.
 * Skips anyone still missing a phone number (respect user's requirement).
 */
function buildLeadList(enrichedPeople, existingNames) {
  const leads = [];

  for (const person of enrichedPeople) {
    const phone = extractBestPhone(person);
    if (!phone) continue; // phone number required

    const bizName = (person.organization_name || '').trim();
    if (!bizName) continue;

    // Re-check duplicates (in case enrichment added org aliases)
    if (existingNames.has(bizName.toLowerCase())) continue;

    leads.push({
      businessName: bizName,
      firstName:    (person.first_name || '').trim(),
      lastName:     (person.last_name  || '').trim(),
      phone,
      city:         (person.city || '').trim(),
      website:      extractWebsite(person),
    });
  }

  return leads;
}

// ── Connection Verification ────────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n── Verifying API Connections ─────────────────────────────────\n');

  // Check Apollo
  process.stdout.write('Apollo.io … ');
  try {
    const results = await searchHVACPeople(1, 1);
    console.log(`✓  Connected (got ${results.length} result)`);
  } catch (err) {
    console.log(`✗  FAILED: ${err.message}`);
  }

  // Check Google Sheets
  process.stdout.write('Google Sheets … ');
  try {
    await ensureHeaderRow();
    const names = await getExistingBusinessNames();
    console.log(`✓  Connected (${names.size} existing rows)`);
  } catch (err) {
    console.log(`✗  FAILED: ${err.message}`);
  }

  console.log('\n─────────────────────────────────────────────────────────────\n');
}

// ── Entry Point ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  verifyConnections();
} else {
  // Start the daily cron scheduler
  console.log(`\nHVAC Lead Gen Scheduler`);
  console.log(`  Schedule : ${config.cronSchedule} (${config.cronTimezone})`);
  console.log(`  Max leads: ${config.maxLeadsPerRun} per run`);
  console.log(`  Cities   : ${config.cities.length} Southwest Michigan cities\n`);

  cron.schedule(config.cronSchedule, runLeadGeneration, {
    timezone: config.cronTimezone,
  });

  console.log('Scheduler is running. Waiting for 7:00am Eastern…');
  console.log('Press Ctrl+C to stop.\n');

  // Fire immediately if the --run-now flag is passed
  if (args.includes('--run-now')) {
    console.log('--run-now flag detected. Running immediately…\n');
    runLeadGeneration();
  }
}
