/**
 * Manual trigger — runs one lead gen cycle immediately without starting the scheduler.
 * Use this to test or to top-up leads on demand.
 *
 * Usage: node run-now.js
 */

require('dotenv').config();
const { runWorkflow } = require('./run-workflow');
const { log } = require('./logger');

(async () => {
  log.info('Manual run triggered.');
  try {
    const result = await runWorkflow();
    if (result.error) {
      log.error(`Run finished with error: ${result.error}`);
      process.exit(1);
    } else {
      log.success(`Done. Added ${result.added} new lead(s) to the sheet.`);
      process.exit(0);
    }
  } catch (err) {
    log.error(`Unexpected error: ${err.stack}`);
    process.exit(1);
  }
})();
