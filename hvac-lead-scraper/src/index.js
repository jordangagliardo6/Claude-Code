/**
 * HVAC Lead Scraper — Scheduled entry point.
 * Runs every morning at 7:00 AM Eastern Time.
 *
 * Usage: node src/index.js
 * Keep this process running (e.g. via pm2 or a cron-triggered Docker container).
 *
 * Note: node-cron jobs only fire while this process is alive.
 * For server deployment, use pm2: pm2 start src/index.js --name hvac-scraper
 */

require('dotenv').config();
const cron = require('node-cron');
const { fetchLeads } = require('./scraper');
const { appendLeads } = require('./sheets');
const { notifyError, notifySuccess } = require('./notify');
const config = require('./config');

async function runScraper() {
  const startTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n[Scheduler] Triggered at ${startTime} (Eastern)`);
  console.log(`[Scheduler] Max leads this run: ${config.maxLeadsPerRun}`);

  let leads = [];
  let added = 0;

  try {
    leads = await fetchLeads(config.maxLeadsPerRun);

    if (leads.length === 0) {
      const msg = 'Apollo.io returned 0 results for this run.';
      console.warn(`[Scheduler] ${msg}`);
      await notifyError('Scheduled run — Apollo returned no results', new Error(msg));
      return;
    }

    console.log(`[Scheduler] Got ${leads.length} lead(s) from Apollo.`);
  } catch (err) {
    console.error('[Scheduler] Apollo fetch failed:', err.message);
    await notifyError('Scheduled run — Apollo.io fetch', err);
    return;
  }

  try {
    added = await appendLeads(leads);
    const skipped = leads.length - added;
    console.log(`[Scheduler] Done. Added: ${added}, Skipped (duplicates): ${skipped}`);
    await notifySuccess(added, skipped, leads.length);
  } catch (err) {
    console.error('[Scheduler] Sheets write failed:', err.message);
    await notifyError('Scheduled run — Google Sheets write', err);
  }
}

// Schedule: 7:00 AM Eastern, every day
// node-cron uses the system timezone by default; we override to America/New_York
const job = cron.schedule(
  '0 7 * * *',
  runScraper,
  {
    scheduled: true,
    timezone: 'America/New_York',
  }
);

const nextRun = new Date();
nextRun.setHours(7, 0, 0, 0);
if (nextRun <= new Date()) {
  nextRun.setDate(nextRun.getDate() + 1);
}

console.log('========================================');
console.log('HVAC Lead Scraper — Scheduler started');
console.log(`Schedule: 7:00 AM Eastern, every day`);
console.log(`Next run: ${nextRun.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
console.log('');
console.log('To run immediately: node src/run-once.js');
console.log('To verify setup:    node src/setup-verify.js');
console.log('========================================');

// Graceful shutdown
process.on('SIGTERM', () => { job.stop(); process.exit(0); });
process.on('SIGINT',  () => { job.stop(); process.exit(0); });
