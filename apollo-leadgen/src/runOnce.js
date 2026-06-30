/**
 * Run the workflow a single time, immediately, without the scheduler.
 * Usage: npm run run-once
 */

require('dotenv').config();
const { runWorkflow } = require('./workflow');

runWorkflow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Unhandled error during run:', err);
    process.exit(1);
  });
