/**
 * Run the workflow a single time immediately (no scheduler).
 * Useful for testing or manually triggering a pull outside of the cron window.
 * Usage: npm run run-once
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { runWorkflow } = require('./workflow');

runWorkflow()
  .then(summary => {
    if (summary.error) process.exit(1);
  })
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
