/**
 * Main workflow — runs one complete lead generation cycle:
 *   1. Search Apollo.io for HVAC leads in SW Michigan
 *   2. Deduplicate against the existing Google Sheet
 *   3. Append new leads to the sheet
 *   4. Send an alert if anything goes wrong
 *
 * Can be run directly:  node src/workflow.js
 * Or called by the scheduler on a cron schedule.
 */

require('dotenv').config();
const { searchLeads } = require('./apolloSearch');
const { appendLeads } = require('./sheetsWriter');
const { sendAlert } = require('./notifier');
const log = require('./logger');
const config = require('./config');

async function run() {
  const startTime = Date.now();
  log.info('═══════════════════════════════════════════════════════');
  log.info('HVAC Lead Generation Workflow — starting run');
  log.info(`Target: ${config.MAX_LEADS} leads across ${config.TARGET_CITIES.length} cities`);
  log.info('═══════════════════════════════════════════════════════');

  let leads = [];

  // ── Step 1: Search Apollo ─────────────────────────────────────────────────
  try {
    leads = await searchLeads(config.MAX_LEADS);
  } catch (err) {
    const msg = `Apollo.io search failed: ${err.message}`;
    log.error(msg);
    await sendAlert('Apollo search failed', msg);
    return { success: false, error: msg };
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 results matching the configured filters. No leads written.';
    log.warn(msg);
    await sendAlert('No leads found', msg);
    return { success: true, leadsFound: 0, leadsWritten: 0 };
  }

  log.info(`Apollo returned ${leads.length} candidate leads`);

  // ── Step 2 + 3: Dedup and write to Google Sheets ──────────────────────────
  let written = 0;
  try {
    written = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    log.error(msg);
    await sendAlert('Google Sheets write failed', `${msg}\n\nLeads were found but NOT saved:\n${summarizeLeads(leads)}`);
    return { success: false, error: msg };
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info('═══════════════════════════════════════════════════════');
  log.info(`Run complete — ${written} new leads written (${leads.length - written} duplicates skipped) in ${elapsed}s`);
  log.info('═══════════════════════════════════════════════════════');

  return { success: true, leadsFound: leads.length, leadsWritten: written };
}

function summarizeLeads(leads) {
  return leads
    .map((l) => `  • ${l.businessName} | ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`)
    .join('\n');
}

// Allow running directly: node src/workflow.js
if (require.main === module) {
  run()
    .then((result) => {
      if (!result.success) process.exitCode = 1;
    })
    .catch((err) => {
      log.error(`Unhandled error: ${err.message}`);
      process.exitCode = 1;
    });
}

module.exports = { run };
