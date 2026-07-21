'use strict';

/**
 * Scheduler — runs lead-gen.js every morning at 7:00 AM Eastern Time.
 *
 * Start with:  node scheduler.js
 * Keep alive:  use PM2 → pm2 start scheduler.js --name hvac-leads
 */

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./lead-gen');

// Cron expression: minute hour * * *
// 7:00 AM Eastern = 12:00 UTC (EST) / 11:00 UTC (EDT)
// node-cron supports the 'timezone' option — we set 'America/Detroit'
// so the job automatically adjusts for EST ↔ EDT transitions.
const SCHEDULE = '0 7 * * *';
const TIMEZONE = 'America/Detroit';

console.log(`[scheduler] HVAC Lead Gen scheduler started.`);
console.log(`[scheduler] Job will run at 7:00 AM ${TIMEZONE} (${SCHEDULE})`);
console.log(`[scheduler] Press Ctrl+C to stop.\n`);

cron.schedule(SCHEDULE, async () => {
  console.log(`[scheduler] Firing scheduled lead-gen run at ${new Date().toISOString()}`);
  try {
    const result = await run();
    if (result.added != null) {
      console.log(`[scheduler] Run complete — ${result.added} leads added.`);
    }
  } catch (err) {
    console.error(`[scheduler] Uncaught error in lead-gen run: ${err.message}`);
  }
}, { timezone: TIMEZONE });
