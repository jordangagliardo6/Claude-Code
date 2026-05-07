/**
 * One-shot runner — executes the workflow immediately without the scheduler.
 * Use this to manually trigger a run: npm run run-once
 */
require('dotenv').config();
const { runWorkflow } = require('./src/workflow');
const { validate } = require('./src/config');
const logger = require('./src/logger');

(async () => {
  try {
    validate();
  } catch (err) {
    console.error(`\n[STARTUP ERROR] ${err.message}\n`);
    process.exit(1);
  }

  logger.info('Manual run triggered via run-once.js');
  const result = await runWorkflow();

  if (result.success) {
    console.log(`\nDone! ${result.leadsAdded} new lead(s) added to Google Sheets.`);
  } else {
    console.error(`\nRun failed: ${result.error}`);
    process.exit(1);
  }
})();
