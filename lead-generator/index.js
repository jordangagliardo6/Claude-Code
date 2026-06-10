/**
 * index.js — Scheduler entry point
 *
 * Runs the workflow every day at 7:00 AM Eastern Time using node-cron.
 * Start with:  node index.js
 * Test now:    node run-now.js
 * Verify APIs: node setup-check.js
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');

// ─── Pre-flight validation ────────────────────────────────────────────────────

const REQUIRED_ENV = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);

if (missing.length > 0) {
  console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example → .env and fill in the values.\n');
  process.exit(1);
}

// Quick sanity-check that at least one Google auth method is configured
const hasServiceAccountJson = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const hasInlineCredentials = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

if (!hasServiceAccountJson && !hasInlineCredentials) {
  console.error('\nGoogle credentials are missing.');
  console.error('Set GOOGLE_SERVICE_ACCOUNT_JSON (path to JSON key file)');
  console.error('OR set both GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.\n');
  process.exit(1);
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

console.log('─'.repeat(60));
console.log('  HVAC Lead Generator — Scheduler');
console.log('─'.repeat(60));
console.log(`  Schedule    : Daily at 7:00 AM Eastern Time`);
console.log(`  Max leads   : ${process.env.MAX_LEADS_PER_RUN || 25} per run`);
console.log(`  Enrichment  : ${process.env.ENABLE_ENRICHMENT === 'true' ? 'ON (costs credits)' : 'OFF'}`);
console.log(`  Notify      : ${process.env.NOTIFICATION_EMAIL || 'console only'}`);
console.log('─'.repeat(60));
console.log();
console.log('  Scheduler is running. Press Ctrl+C to stop.');
console.log('  Run "node setup-check.js" to test API connections.');
console.log('  Run "node run-now.js"     to trigger a run immediately.');
console.log();

// Cron expression: minute hour day month weekday
// "0 7 * * *" = 7:00 AM every day
cron.schedule('0 7 * * *', async () => {
  console.log(`[CRON] Triggered at ${new Date().toISOString()}`);
  const result = await runWorkflow();
  console.log(`[CRON] Run finished:`, result);
}, {
  timezone: 'America/New_York',
});

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\nShutting down scheduler.');
  process.exit(0);
});
