'use strict';

// Run the workflow immediately (outside the scheduler).
// Usage: node run-now.js

require('dotenv').config();
const logger = require('./src/logger');
const { runWorkflow } = require('./src/workflow');

(async () => {
  logger.info('Manual run triggered via run-now.js');
  const result = await runWorkflow();
  if (result.success) {
    logger.success(`Done — ${result.written} new lead(s) added to the spreadsheet.`);
    process.exit(0);
  } else {
    logger.error(`Run failed: ${result.error}`);
    process.exit(1);
  }
})();
