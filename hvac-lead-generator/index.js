'use strict';

/**
 * Entry point — loads .env then starts the cron scheduler.
 *
 * Usage:
 *   npm start           → keep the process alive, run daily at 7am ET
 *   npm run run-once    → run the workflow immediately and exit
 *   npm run test-connection → verify both APIs before first use
 */

require('dotenv').config();

const logger           = require('./src/logger');
const { startScheduler } = require('./src/scheduler');

// Validate required env vars before starting
const REQUIRED_VARS = [
  'APOLLO_API_KEY',
  'GOOGLE_SPREADSHEET_ID',
  'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
];

const missing = REQUIRED_VARS.filter(k => !process.env[k]);
if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  logger.error('Copy .env.example → .env and fill in the values.');
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT',  () => { logger.info('Received SIGINT — shutting down.'); process.exit(0); });
process.on('SIGTERM', () => { logger.info('Received SIGTERM — shutting down.'); process.exit(0); });

startScheduler();
