'use strict';
// One-shot manual trigger — runs the full workflow immediately and exits.
// Use this to test before the first scheduled run, or to re-run on demand:
//
//   npm run run-now
//
require('dotenv').config();
const logger = require('./src/logger');
const { runWorkflow } = require('./src/workflow');

const REQUIRED = ['APOLLO_API_KEY', 'SPREADSHEET_ID'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

logger.info('Manual run triggered via run-now.js');
runWorkflow()
  .then(() => {
    logger.info('Manual run complete. Check the spreadsheet for new entries.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Unhandled error in manual run', { err: err.message });
    process.exit(1);
  });
