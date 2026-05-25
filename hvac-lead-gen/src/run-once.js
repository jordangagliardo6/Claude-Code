/**
 * One-shot runner — executes the workflow immediately without the scheduler.
 * Useful for testing or manually triggering a run.
 *
 * Usage: node src/run-once.js
 */

require('dotenv').config();
const { runWorkflow } = require('./workflow');

(async () => {
  const result = await runWorkflow();

  if (result.success) {
    console.log(`\nSuccess: ${result.appended} new lead(s) added (${result.fetched - result.appended} duplicate(s) skipped).`);
    process.exit(0);
  } else {
    console.error(`\nWorkflow failed at stage "${result.stage}": ${result.error}`);
    process.exit(1);
  }
})();
