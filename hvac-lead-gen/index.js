/**
 * HVAC Lead Generation — Automated Daily Scheduler
 *
 * Searches Apollo.io for HVAC business owners/decision-makers in Southwest
 * Michigan, deduplicates against an existing Google Sheet, and appends up to
 * MAX_LEADS_PER_RUN new rows every morning at 7:00 AM Eastern.
 *
 * Usage:
 *   node index.js            — start the scheduler (runs at 7am ET daily)
 *   node index.js --run-now  — trigger one run immediately (for testing)
 *   node index.js --verify   — confirm Apollo + Google Sheets connections
 *
 * Prerequisites:
 *   1. Copy .env.example → .env and fill in all values
 *   2. Follow setup.md to obtain Google service account credentials
 *   3. Apollo paid plan (Basic or above) required for people search
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchHvacLeads } = require('./lib/apollo');
const { getExistingBusinessNames, ensureHeaderRow, appendLeads } = require('./lib/sheets');
const { sendErrorAlert } = require('./lib/notify');

// Maximum leads to add per scheduled run — keeps the list manageable.
const MAX_LEADS_PER_RUN = 25;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main lead generation run.
 * Fetches Apollo results, removes duplicates, and appends new rows to the sheet.
 */
async function runLeadGen() {
  const now = new Date();
  const runDate = now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${now.toISOString()}] Starting HVAC lead gen run (${runDate})`);
  console.log('─'.repeat(60));

  try {
    // 1. Make sure the spreadsheet has a header row.
    await ensureHeaderRow();

    // 2. Pull leads from Apollo.
    console.log('Searching Apollo.io for HVAC leads in Southwest Michigan…');
    const rawLeads = await searchHvacLeads();

    if (rawLeads.length === 0) {
      const msg = 'Apollo returned 0 results. This may indicate a plan restriction, ' +
                  'exhausted search results, or an API error. Check your API key and plan.';
      console.warn(msg);
      await sendErrorAlert('No Apollo results', msg);
      return;
    }

    console.log(`Apollo returned ${rawLeads.length} candidate leads (before dedup).`);

    // 3. Read existing business names from the sheet to check for duplicates.
    console.log('Checking spreadsheet for existing entries…');
    const existingNames = await getExistingBusinessNames();
    const seen = new Set(existingNames.map(n => n.toLowerCase().trim()));

    console.log(`${seen.size} existing business(es) in the sheet.`);

    // 4. Filter: must have a phone number AND not already be in the sheet.
    const newLeads = rawLeads
      .filter(lead => lead.phone)
      .filter(lead => !seen.has(lead.businessName.toLowerCase().trim()))
      .slice(0, MAX_LEADS_PER_RUN);

    if (newLeads.length === 0) {
      console.log('No new unique leads with phone numbers found this run. Nothing added.');
      return;
    }

    // 5. Append to the spreadsheet.
    console.log(`Appending ${newLeads.length} new lead(s) to the spreadsheet…`);
    await appendLeads(newLeads, runDate);

    console.log(`\nDone. ${newLeads.length} new lead(s) added on ${runDate}.`);
    newLeads.forEach((l, i) =>
      console.log(`  ${i + 1}. ${l.businessName} — ${l.firstName} ${l.lastName} — ${l.phone} (${l.city})`)
    );

  } catch (err) {
    const message = `${err.message}\n\n${err.stack ?? ''}`;
    await sendErrorAlert('Lead gen run failed', message);
    process.exitCode = 1;
  }
}

// ─── Connection verification ──────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\nVerifying connections…\n');
  let ok = true;

  // Apollo
  try {
    const leads = await searchHvacLeads();
    console.log(`✓ Apollo.io — connected. Search returned ${leads.length} result(s).`);
  } catch (err) {
    console.error(`✗ Apollo.io — ${err.message}`);
    ok = false;
  }

  // Google Sheets
  try {
    const names = await getExistingBusinessNames();
    console.log(`✓ Google Sheets — connected. ${names.length} existing row(s) found.`);
  } catch (err) {
    console.error(`✗ Google Sheets — ${err.message}`);
    ok = false;
  }

  if (ok) {
    console.log('\nAll connections verified. Ready to run the scheduler.\n');
  } else {
    console.error('\nOne or more connections failed. Fix the errors above before scheduling.\n');
    process.exit(1);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  verifyConnections();

} else if (args.includes('--run-now')) {
  console.log('Running immediately (--run-now flag detected)…');
  runLeadGen();

} else {
  // Schedule at 7:00 AM Eastern Time, every day.
  cron.schedule('0 7 * * *', runLeadGen, { timezone: 'America/New_York' });

  console.log('HVAC Lead Gen scheduler started.');
  console.log('Next run: 7:00 AM Eastern Time.');
  console.log('To test immediately: node index.js --run-now');
  console.log('To verify connections: node index.js --verify');
  console.log('\nPress Ctrl+C to stop.\n');
}
