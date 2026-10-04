require('dotenv').config();
const cron = require('node-cron');
const { config, validate } = require('./config');
const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { notifyError, logSuccess } = require('./notify');

// Core workflow: pull leads from Apollo, append new ones to Google Sheets.
async function runLeadGen() {
  console.log(`\n[Run] Starting lead gen — ${new Date().toISOString()}`);

  let leads;
  try {
    leads = await searchLeads();
  } catch (err) {
    await notifyError('Apollo search failed', err.message);
    return;
  }

  if (!leads || leads.length === 0) {
    await notifyError('Apollo returned 0 results', 'The Apollo search returned no leads with phone numbers. This may indicate the search filters need adjustment, or your Apollo plan does not include phone numbers for this region.\n\nCheck: app.apollo.io — try searching manually for HVAC companies in Kalamazoo, MI with employee count 1–25.');
    return;
  }

  let result;
  try {
    result = await appendLeads(leads);
  } catch (err) {
    await notifyError('Google Sheets write failed', err.message);
    return;
  }

  logSuccess(result.added, result.skipped);
}

// Runs once if --once flag is passed (useful for manual testing),
// otherwise starts the cron scheduler.
const runOnce = process.argv.includes('--once');

if (runOnce) {
  validate();
  runLeadGen().catch((err) => {
    console.error('[Fatal]', err.message);
    process.exit(1);
  });
} else {
  validate();

  console.log(`[Scheduler] Starting — schedule: "${config.schedule.cron}" (${config.schedule.timezone})`);
  console.log(`[Scheduler] Next run will be at 7:00 AM Eastern. Use "node src/index.js --once" to run immediately.`);

  cron.schedule(
    config.schedule.cron,
    async () => {
      await runLeadGen().catch(async (err) => {
        await notifyError('Unhandled error in lead gen run', err.message);
      });
    },
    { timezone: config.schedule.timezone }
  );
}
