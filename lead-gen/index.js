/**
 * index.js — Scheduler and main run loop.
 *
 * Default mode:  node index.js
 *   Starts the cron scheduler (7am Eastern daily). Process stays alive.
 *
 * Manual mode:   node index.js --run-now   (or npm run run-now)
 *   Runs one cycle immediately then exits. Useful for testing and backfills.
 */

require('dotenv').config();

const cron = require('node-cron');
const { fetchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendErrorAlert } = require('./notifier');
const config = require('./config');

// ── Core run logic ────────────────────────────────────────────────────────────

async function run() {
  const startedAt = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${startedAt}] Lead generation run starting…`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // ── Step 1: Search Apollo ────────────────────────────────────────────────
    console.log('Searching Apollo.io for HVAC decision-makers in SW Michigan…');
    let leads = await fetchLeads();

    if (leads.length === 0) {
      const msg =
        `Apollo returned 0 leads with phone numbers.\n\n` +
        `Run started at: ${startedAt}\n\n` +
        `Possible causes:\n` +
        `  • Your Apollo plan may not include phone number data — check your plan tier.\n` +
        `  • The search filters may be too narrow — review config.js.\n` +
        `  • Apollo API key may be invalid or rate-limited.\n\n` +
        `No rows were written to the spreadsheet.`;

      await sendErrorAlert('Apollo returned no leads with phone numbers', msg);
      return;
    }

    console.log(`Found ${leads.length} leads with phone numbers.`);

    // ── Step 2: Cap at maxLeadsPerRun ────────────────────────────────────────
    if (leads.length > config.maxLeadsPerRun) {
      console.log(`Capping at ${config.maxLeadsPerRun} leads for this run.`);
      leads = leads.slice(0, config.maxLeadsPerRun);
    }

    // ── Step 3: Write to Google Sheets (with duplicate check) ────────────────
    console.log(`Appending leads to Google Sheets…`);
    const { added, skipped } = await appendLeads(leads);

    console.log(
      `Run complete: ${added} new lead(s) added, ${skipped} duplicate(s) skipped.`
    );
  } catch (err) {
    const msg =
      `The lead generation run threw an unhandled error.\n\n` +
      `Run started at: ${startedAt}\n\n` +
      `Error: ${err.message}\n\n` +
      `Stack trace:\n${err.stack}`;

    await sendErrorAlert('Lead generation run failed', msg);
    // Do not re-throw — let the scheduler keep running on future cycles
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // One-shot mode: run once and exit
  run()
    .then(() => {
      console.log('\nManual run finished. Exiting.');
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
} else {
  // Scheduler mode: stay alive and run on the configured cron schedule
  if (!cron.validate(config.cronSchedule)) {
    console.error(`Invalid cron expression: "${config.cronSchedule}". Exiting.`);
    process.exit(1);
  }

  cron.schedule(config.cronSchedule, run, { timezone: config.cronTimezone });

  console.log(
    `\nScheduler running. Next execution: 7:00am Eastern every day.\n` +
    `Cron: "${config.cronSchedule}" | Timezone: ${config.cronTimezone}\n\n` +
    `Press Ctrl+C to stop.\n`
  );

  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT — shutting down scheduler.');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM — shutting down scheduler.');
    process.exit(0);
  });
}
