/**
 * One-shot manual trigger — runs the workflow immediately and exits.
 * Usage: node run-now.js
 */

require('dotenv').config();
const { run } = require('./lib/runner');

run()
  .then(result => {
    if (result.success) {
      console.log(`\nResult: ${result.added} added, ${result.skipped} skipped.`);
      process.exit(0);
    } else {
      console.error(`\nWorkflow failed at stage: ${result.stage}`);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
