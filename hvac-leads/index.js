/**
 * index.js
 * Scheduler entry point.
 *
 * Usage:
 *   node index.js          — starts the cron daemon (runs every day at 7am Eastern)
 *   npm run run-now        — fires one immediate run then exits
 *   node test-connection.js — verify both APIs before your first scheduled run
 */

require('dotenv').config();
const cron = require('node-cron');
const { runLeadGeneration } = require('./leadgen');
const { notifyError } = require('./notify');

// ── Cron expression: 7:00 AM Eastern ─────────────────────────────────────────
// node-cron respects the timezone option so this works correctly for both
// EST (UTC-5) and EDT (UTC-4) without manual adjustment.
const CRON_EXPRESSION = '0 7 * * *'; // minute=0, hour=7, every day
const TIMEZONE = 'America/New_York';

// ── Schedule ──────────────────────────────────────────────────────────────────
cron.schedule(
  CRON_EXPRESSION,
  async () => {
    console.log('[Scheduler] Cron fired — starting lead generation run');
    try {
      await runLeadGeneration();
    } catch (err) {
      // notifyError already called inside runLeadGeneration(), but log here too
      console.error('[Scheduler] Run failed:', err.message);
    }
  },
  { timezone: TIMEZONE }
);

const nextRun = getNextRunDescription();
console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║         HVAC Lead Generator — Scheduler Active           ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log(`║  Schedule : Daily at 7:00 AM Eastern Time                ║`);
console.log(`║  Next run : ${nextRun.padEnd(45)}║`);
console.log(`║  Max leads: ${String(process.env.MAX_LEADS_PER_RUN ?? 25).padEnd(45)}║`);
console.log('╠══════════════════════════════════════════════════════════╣');
console.log('║  To run immediately: Ctrl+C, then npm run run-now        ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

function getNextRunDescription() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(7, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}
