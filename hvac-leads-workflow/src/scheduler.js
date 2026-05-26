/**
 * scheduler.js — entry point for the cron-based runner
 *
 * Start with:  node src/scheduler.js   (or npm start)
 * The process must stay running; use PM2 or a systemd service in production.
 */

require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const { runWorkflow } = require('./workflow');
const logger = require('./logger');

logger.info(`HVAC Leads scheduler starting — cron: "${config.cronSchedule}"`);
logger.info(`Spreadsheet ID: ${config.sheets.spreadsheetId}`);
logger.info(`Targeting: ${config.targetCities.join(', ')}`);

if (!cron.validate(config.cronSchedule)) {
  logger.error(`Invalid CRON_SCHEDULE: "${config.cronSchedule}" — fix it in .env and restart`);
  process.exit(1);
}

cron.schedule(config.cronSchedule, () => {
  logger.info('Cron fired — running workflow now');
  runWorkflow().catch(err => logger.error('Unhandled error in scheduled run', err));
});

logger.info('Scheduler is running. Press Ctrl+C to stop.');
