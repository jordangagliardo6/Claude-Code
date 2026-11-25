/**
 * HVAC Lead Generation Workflow
 *
 * Runs at 7:00 AM Eastern every day via node-cron.
 * Searches Apollo.io for HVAC owner-operated businesses in Southwest Michigan,
 * appends up to 25 new leads per run to a Google Sheet, and sends an alert
 * on failure.
 *
 * Quick start:
 *   cp .env.example .env        # fill in your keys
 *   npm install
 *   node test-connection.js     # verify both APIs before first scheduled run
 *   npm start                   # start the scheduler (keep this process running)
 *   npm run run-once            # trigger one run immediately (for testing)
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHVACLeads } = require('./src/apollo');
const { appendLeads } = require('./src/sheets');
const { sendAlert } = require('./src/notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// "0 7 * * *" = 7:00 AM. node-cron runs in the server's local time by default;
// we explicitly pass timeZone to stay on Eastern regardless of server location.
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

/**
 * Core workflow — called by the cron job and by --run-now.
 */
async function runWorkflow() {
  const startedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${startedAt}] Starting HVAC lead generation run`);
  console.log(`  Max leads this run: ${MAX_LEADS}`);

  try {
    // ── 1. Fetch leads from Apollo ────────────────────────────────────────────
    console.log('\nSearching Apollo.io for HVAC contacts...');
    const { contacts, totalEntries } = await searchHVACLeads(1, MAX_LEADS);

    if (contacts.length === 0) {
      const msg =
        `Apollo returned 0 contacts with phone numbers for today's search.\n` +
        `Total matching entries in Apollo: ${totalEntries}.\n` +
        `This may mean the free-tier quota is exhausted or the filters need adjustment.`;

      console.warn(`[warn] ${msg}`);
      await sendAlert('No leads returned from Apollo', msg);
      return;
    }

    console.log(`  Found ${contacts.length} contacts (${totalEntries} total in Apollo)`);

    // ── 2. Write to Google Sheets ─────────────────────────────────────────────
    console.log('\nAppending to Google Sheet...');
    const { added, skipped } = await appendLeads(contacts);

    console.log(`  ✓ Added: ${added}  |  Skipped (duplicates or no name): ${skipped}`);
    console.log(`\nRun complete.\n`);

  } catch (err) {
    const errorBody =
      `Error during HVAC lead run at ${startedAt}\n\n` +
      `Message: ${err.message}\n\n` +
      `Stack:\n${err.stack}`;

    console.error('\n[error]', err.message);
    await sendAlert('Workflow error — manual check needed', errorBody);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // npm run run-once — execute immediately, then exit
  runWorkflow().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  // npm start — start the scheduler and keep the process alive
  console.log(`HVAC Lead Workflow started.`);
  console.log(`Scheduled: "${CRON_SCHEDULE}" (America/New_York)`);
  console.log(`Next run: 7:00 AM Eastern. Waiting...\n`);
  console.log(`Tip: run  node test-connection.js  to verify APIs are connected.\n`);

  cron.schedule(CRON_SCHEDULE, runWorkflow, { timezone: 'America/New_York' });

  // Keep the process running — cron handles the rest
}
