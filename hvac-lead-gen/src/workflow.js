/**
 * workflow.js — Core logic for one lead-gen run.
 *
 * Can be executed directly ("npm run run-now") or called by the scheduler.
 */

require('dotenv').config();

const { searchLeads }    = require('./apollo');
const { appendLeads, ensureHeaders } = require('./sheets');
const { sendErrorAlert } = require('./notifier');
const log                = require('./logger');

async function run() {
  log.info('═══ HVAC Lead Gen run starting ═══');

  // ── Step 1: Verify headers exist ─────────────────────────────────────────
  try {
    await ensureHeaders();
  } catch (err) {
    await sendErrorAlert('Header check failed', err.message);
    return;
  }

  // ── Step 2: Fetch leads from Apollo ──────────────────────────────────────
  let leads;
  try {
    leads = await searchLeads();
  } catch (err) {
    await sendErrorAlert('Apollo search failed', err.message);
    return;
  }

  if (leads.length === 0) {
    await sendErrorAlert(
      'Apollo returned zero leads',
      'Apollo returned no contacts matching your filters. ' +
      'Check your APOLLO_API_KEY and that your plan allows people search. ' +
      'Also verify the industry/location filters in src/config.js.'
    );
    return;
  }

  // ── Step 3: Append to Google Sheets ──────────────────────────────────────
  let written;
  try {
    written = await appendLeads(leads);
  } catch (err) {
    await sendErrorAlert('Google Sheets write failed', err.message);
    return;
  }

  log.info(`═══ Run complete — ${written} new lead(s) added ═══`);
}

// Allow direct execution for ad-hoc runs.
if (require.main === module) {
  run().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}

module.exports = { run };
