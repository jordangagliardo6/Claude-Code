'use strict';

/**
 * index.js — persistent process entry point
 *
 * Starts the daily scheduler and keeps the Node.js process alive.
 * Run with:  node index.js
 * Or use pm2: pm2 start index.js --name lead-gen
 */

require('dotenv').config();
const scheduler = require('./src/scheduler');
const logger = require('./src/logger');

logger.info('===========================================');
logger.info(' HVAC Lead-Gen — Southwest Michigan');
logger.info('===========================================');

// Start the daily cron job (7 am Eastern Time by default)
const task = scheduler.start();

// Graceful shutdown on SIGINT (Ctrl+C) or SIGTERM
function shutdown(signal) {
  logger.info(`Received ${signal} — stopping scheduler and exiting.`);
  task.stop();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Keep the process alive
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
  // Do NOT exit — let the scheduler continue running
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${reason}`);
});
