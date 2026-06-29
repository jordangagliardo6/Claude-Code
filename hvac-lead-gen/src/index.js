/**
 * index.js — Main entry point and cron scheduler
 *
 * Runs the lead generation job every day at 7:00 AM Eastern Time.
 * Keep this process running (e.g. via pm2, systemd, or a terminal session)
 * for the schedule to fire.
 *
 * Usage:
 *   node src/index.js          — start the scheduler
 *   npm start                  — same via npm
 *   node src/run-now.js        — trigger one immediate run (no scheduler)
 *   node src/verify.js         — test connectivity before first run
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchHVACLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { logError, logInfo } = require('./logger');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

/**
 * Core job: pull leads from Apollo, deduplicate against the sheet, append new rows.
 */
async function runLeadGeneration() {
  logInfo(`Starting HVAC lead generation (max ${MAX_LEADS} leads)...`);

  let leads;
  try {
    leads = await searchHVACLeads(MAX_LEADS);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    console.error(msg);
    await logError(msg, err);
    return;
  }

  if (!leads || leads.length === 0) {
    const msg = 'Apollo returned 0 results for HVAC Southwest Michigan. No rows written.';
    console.warn(msg);
    await logError(msg);
    return;
  }

  logInfo(`Apollo returned ${leads.length} candidate leads. Writing to Google Sheets...`);

  let stats;
  try {
    stats = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    console.error(msg);
    await logError(msg, err);
    return;
  }

  logInfo(`Run complete — added: ${stats.added}, skipped (duplicates): ${stats.skipped}`);
}

// ── Cron schedule: 7:00 AM Eastern Time every day ─────────────────────────
// node-cron schedule format: second(opt) minute hour day-of-month month day-of-week
cron.schedule('0 7 * * *', runLeadGeneration, {
  timezone: 'America/New_York',
  scheduled: true,
});

// ── Startup banner ─────────────────────────────────────────────────────────
const now = new Date();
const nextRun = getNext7amET(now);

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║       HVAC Lead Generator — Scheduler Active     ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log(`  Schedule  : 7:00 AM Eastern Time, every day`);
console.log(`  Next run  : ${nextRun}`);
console.log(`  Max leads : ${MAX_LEADS} per run`);
console.log(`  Reveal ph : ${process.env.REVEAL_PHONE_NUMBERS === 'true' ? 'yes (uses credits)' : 'no'}`);
console.log('');
console.log('  Press Ctrl+C to stop.');
console.log('  Run `node src/run-now.js` to trigger immediately.');
console.log('');

/**
 * Calculates and formats the next 7am ET occurrence as a human-readable string.
 */
function getNext7amET(from) {
  // Convert to ET to determine whether today's 7am has passed
  const etNow = new Date(from.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const candidate = new Date(etNow);
  candidate.setHours(7, 0, 0, 0);
  if (candidate <= etNow) candidate.setDate(candidate.getDate() + 1);
  return candidate.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
