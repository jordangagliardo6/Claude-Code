'use strict';

require('dotenv').config();

const logger    = require('./src/logger');
const scheduler = require('./src/scheduler');

// ─── Validate required env vars before doing anything ────────────────────────
const REQUIRED = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
const missing  = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values, then run again.\n');
  process.exit(1);
}

logger.info('HVAC Lead-Gen Workflow starting up…');
logger.info(`Targeting cities: ${require('./src/config').TARGET_CITIES.join(', ')}`);
logger.info(`Max leads per run: ${require('./src/config').MAX_LEADS_PER_RUN}`);
logger.info('Logs: logs/workflow.log');

scheduler.start();
logger.info('Process is running. Press Ctrl+C to stop.\n');
