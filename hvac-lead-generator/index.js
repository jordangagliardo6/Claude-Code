'use strict';
require('dotenv').config();
const logger = require('./src/logger');
const { startScheduler } = require('./src/scheduler');
const config = require('./src/config');

// Validate required env vars before starting so the failure is obvious.
const REQUIRED = ['APOLLO_API_KEY', 'SPREADSHEET_ID'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  logger.error('Copy .env.example to .env, fill in the values, then run again.');
  process.exit(1);
}

logger.info('HVAC Lead Generator starting…', {
  spreadsheet: config.spreadsheetId,
  citiesCount: config.targetCities.length,
  maxLeadsPerRun: config.maxLeadsPerRun,
});

startScheduler();
logger.info('Process is live. Workflow runs daily at 7:00 AM Eastern Time. Press Ctrl+C to stop.');
