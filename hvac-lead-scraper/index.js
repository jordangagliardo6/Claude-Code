/**
 * HVAC Lead Scraper — Main Entry Point
 *
 * Searches Apollo.io for HVAC company owners in Southwest Michigan and
 * appends new contacts to a Google Sheet, deduplicating by business name.
 *
 * Schedule: daily at 7:00 AM Eastern Time
 * Max new leads per run: 25
 *
 * Usage:
 *   node index.js              → start the scheduler (keeps running)
 *   node index.js --run-now   → run the workflow immediately, then keep scheduling
 *   node index.js --verify    → test connections to Apollo and Google Sheets, then exit
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHvacLeads, verifyApolloConnection } = require('./apollo');
const { getExistingBusinessNames, appendLeads, ensureHeaders, verifySheetConnection } = require('./sheets');
const { sendErrorNotification } = require('./notify');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Edit this list to add, remove, or reorder target cities.
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Maximum new leads to add per scheduled run. Keeps the list manageable.
const MAX_LEADS_PER_RUN = 25;

// Cron schedule: "0 7 * * *" = 7:00 AM every day
// Change this string to adjust the time — https://crontab.guru is helpful.
const CRON_SCHEDULE = '0 7 * * *';
const CRON_TIMEZONE = 'America/New_York';
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core workflow: fetch leads from Apollo → deduplicate → write to Sheets.
 */
async function runLeadCollection() {
  const runStart = new Date();
  console.log(`\n[${runStart.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET] ─── Starting HVAC lead collection ───`);
  console.log(`  Cities: ${TARGET_CITIES.join(', ')}`);
  console.log(`  Max leads this run: ${MAX_LEADS_PER_RUN}`);

  try {
    // 1. Make sure the spreadsheet has headers
    await ensureHeaders();

    // 2. Fetch leads from Apollo
    console.log('\n  Querying Apollo.io...');
    const apolloLeads = await searchHvacLeads(TARGET_CITIES, MAX_LEADS_PER_RUN);

    if (!apolloLeads || apolloLeads.length === 0) {
      const msg = `Apollo returned 0 results for cities: ${TARGET_CITIES.join(', ')}.\n\nPossible causes:\n- API key invalid or rate-limited\n- No matching companies in Apollo's database for these filters\n- Try broadening the city list or industry keywords in apollo.js`;
      console.warn('  ⚠  No results from Apollo. Sending alert...');
      await sendErrorNotification('No Apollo Results', msg);
      return;
    }

    console.log(`  Apollo returned ${apolloLeads.length} leads with phone numbers.`);

    // 3. Read existing business names from the sheet
    console.log('  Reading existing leads from Google Sheet...');
    const existingNames = await getExistingBusinessNames();
    console.log(`  Sheet currently has ${existingNames.size} unique businesses.`);

    // 4. Filter out duplicates (case-insensitive business name match)
    const newLeads = apolloLeads.filter(
      (lead) => !existingNames.has(lead.businessName.toLowerCase().trim())
    );

    const dupeCount = apolloLeads.length - newLeads.length;
    if (dupeCount > 0) {
      console.log(`  Skipped ${dupeCount} duplicate(s) already in the sheet.`);
    }

    if (newLeads.length === 0) {
      console.log('  No new leads to add — all results are already in the sheet.');
      console.log('  ✓ Run complete (nothing to append).');
      return;
    }

    // 5. Append new leads to the sheet
    console.log(`  Appending ${newLeads.length} new lead(s) to Google Sheet...`);
    await appendLeads(newLeads);

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    console.log(`  ✓ Done. ${newLeads.length} new lead(s) added in ${elapsed}s.`);

    // Print a quick summary to the log
    newLeads.forEach((l) => {
      console.log(`    • ${l.businessName} | ${l.ownerFirstName} ${l.ownerLastName} | ${l.phone} | ${l.city}`);
    });

  } catch (err) {
    const msg = `Lead collection failed with an unhandled error.\n\nError: ${err.message}\n\nStack trace:\n${err.stack}`;
    console.error('\n  ✗ Run failed:', err.message);
    await sendErrorNotification('Run Failed', msg);
  }
}

/**
 * --verify mode: test both API connections and exit.
 */
async function verifyConnections() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   HVAC Lead Scraper — Connection Verify    ║');
  console.log('╚════════════════════════════════════════════╝\n');

  let allGood = true;

  // Check Apollo
  process.stdout.write('  Checking Apollo.io API key... ');
  try {
    const result = await verifyApolloConnection();
    console.log(`✓ Connected  (${result.totalAvailable.toLocaleString()} contacts available in MI)`);
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`    Error: ${err.message}`);
    allGood = false;
  }

  // Check Google Sheet
  process.stdout.write('  Checking Google Sheet access... ');
  try {
    const result = await verifySheetConnection();
    console.log(`✓ Connected  (${result.existingLeads} existing lead row(s) found)`);
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`    Error: ${err.message}`);
    allGood = false;
  }

  // Check notification config (optional — just warn)
  const hasEmail = !!(process.env.NOTIFICATION_EMAIL && process.env.GMAIL_APP_PASSWORD);
  console.log(`  Email notifications: ${hasEmail ? '✓ Configured' : '⚠  Not configured (NOTIFICATION_EMAIL / GMAIL_APP_PASSWORD not set)'}`);

  console.log('');
  if (allGood) {
    console.log('✓ All required connections verified. Safe to run --run-now or start the scheduler.');
  } else {
    console.log('✗ One or more connections failed. Fix the errors above before running.');
    process.exit(1);
  }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  verifyConnections();
} else {
  // Start the daily cron scheduler
  cron.schedule(CRON_SCHEDULE, runLeadCollection, { timezone: CRON_TIMEZONE });

  const nextMsg = `Scheduled to run daily at 7:00 AM ET (cron: "${CRON_SCHEDULE}", tz: ${CRON_TIMEZONE})`;
  console.log('╔════════════════════════════════════════════╗');
  console.log('║       HVAC Lead Scraper — Running          ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(nextMsg);
  console.log('Run "node index.js --verify" to test connections.');
  console.log('Run "node index.js --run-now" to execute immediately.');
  console.log('Press Ctrl+C to stop.\n');

  // --run-now triggers an immediate execution in addition to scheduling
  if (args.includes('--run-now')) {
    runLeadCollection();
  }
}
