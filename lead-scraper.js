'use strict';

// Load environment variables from .env before anything else
require('dotenv').config();

const cron = require('node-cron');
const { searchHvacLeads } = require('./src/apollo-client');
const { writeLeadsToSheet } = require('./src/sheets-client');
const { notifyError, logSuccess } = require('./src/notifier');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';   // default: 7:00 AM
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || 'America/New_York';

// ─────────────────────────────────────────────────────────────────────────────
// Core workflow — called once per scheduled run
// ─────────────────────────────────────────────────────────────────────────────

async function runWorkflow() {
  const runAt = new Date().toLocaleString('en-US', { timeZone: CRON_TIMEZONE });
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`HVAC Lead Scraper — ${runAt} ET`);
  console.log(`${'─'.repeat(60)}`);

  // ── Step 1: Pull leads from Apollo ────────────────────────────────────────
  console.log(`\n[1/2] Searching Apollo.io for up to ${MAX_LEADS} HVAC leads…`);

  let leads;
  try {
    leads = await searchHvacLeads(MAX_LEADS);
  } catch (err) {
    console.error('Apollo search failed:', err.message);
    await notifyError('Apollo.io search', err);
    return;
  }

  if (!leads || leads.length === 0) {
    const noResultsErr = new Error(
      'Apollo returned 0 results for Southwest Michigan HVAC. ' +
      'Check your API key, filters, or Apollo credit balance.'
    );
    await notifyError('Apollo.io search — no results', noResultsErr);
    return;
  }

  console.log(`  Apollo returned ${leads.length} contacts with phone numbers.`);

  // ── Step 2: Write to Google Sheets ────────────────────────────────────────
  console.log('\n[2/2] Writing new leads to Google Sheets…');

  let result;
  try {
    result = await writeLeadsToSheet(leads);
  } catch (err) {
    console.error('Google Sheets write failed:', err.message);
    await notifyError('Google Sheets write', err);
    return;
  }

  logSuccess(result.added, result.skipped, leads.length);

  console.log(`\nDone. Added ${result.added} new leads, skipped ${result.skipped} duplicates.`);
  console.log(`${'─'.repeat(60)}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Validate required env vars before scheduling
  const missing = [];
  if (!process.env.APOLLO_API_KEY)      missing.push('APOLLO_API_KEY');
  if (!process.env.GOOGLE_SHEET_ID)     missing.push('GOOGLE_SHEET_ID');
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your values, then run again.');
    process.exit(1);
  }

  // Validate cron expression
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}"`);
    process.exit(1);
  }

  // If --run-now flag is passed, execute immediately (useful for testing)
  if (process.argv.includes('--run-now')) {
    console.log('Running immediately (--run-now flag detected)…');
    await runWorkflow();
    process.exit(0);
  }

  // Schedule the recurring job
  console.log(`HVAC Lead Scraper started.`);
  console.log(`Schedule: "${CRON_SCHEDULE}" in timezone ${CRON_TIMEZONE}`);
  console.log(`Next run: 7:00 AM Eastern every morning`);
  console.log(`Max leads per run: ${MAX_LEADS}`);
  console.log(`\nRunning in background — press Ctrl+C to stop.\n`);

  cron.schedule(CRON_SCHEDULE, runWorkflow, {
    timezone: CRON_TIMEZONE,
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
