/**
 * HVAC Leads Workflow — Scheduler Entry Point
 *
 * Runs the lead generation job on a cron schedule (default: 7:00 AM ET daily).
 * Start with: npm start
 */

require('dotenv').config();
const cron   = require('node-cron');
const config = require('./config');
const { fetchHvacLeads } = require('./apollo');
const { appendLeads }    = require('./sheets');
const logger             = require('./logger');

// ── Core job ──────────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  logger.info('═══ HVAC Lead Generation — Run Starting ═══');

  try {
    // 1. Pull leads from Apollo.io
    const leads = await fetchHvacLeads();

    if (!leads || leads.length === 0) {
      const msg =
        'Apollo returned qualifying contacts but none had a phone number. ' +
        'Try relaxing the city filter or check your Apollo plan for phone access.';
      logger.warn(msg);
      await logger.sendErrorAlert('No Qualifying Leads', msg);
      return;
    }

    // 2. Write new leads to Google Sheets (dedup is handled inside appendLeads)
    const added = await appendLeads(leads);

    logger.info(`═══ Run Complete — ${added} new lead(s) added ═══`);
  } catch (err) {
    const msg = `Lead generation failed: ${err.message}`;
    logger.error(msg, err);
    await logger.sendErrorAlert('Workflow Error', `${msg}\n\nStack trace:\n${err.stack}`);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

if (!config.apollo.apiKey) {
  logger.error('APOLLO_API_KEY is not set. Add it to your .env file and restart.');
  process.exit(1);
}

logger.info(`Scheduling lead generation: "${config.cronSchedule}" (${config.cronTimezone})`);
logger.info(`Spreadsheet: https://docs.google.com/spreadsheets/d/${config.sheets.spreadsheetId}`);

cron.schedule(config.cronSchedule, runLeadGeneration, {
  timezone: config.cronTimezone,
});

logger.info('Scheduler is running. Next trigger: tomorrow at 7:00 AM Eastern Time.');
logger.info('To run immediately without waiting, use: npm run run-now');
