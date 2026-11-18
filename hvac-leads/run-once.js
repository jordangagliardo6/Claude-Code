/**
 * One-shot run — executes the lead generator immediately without waiting for the schedule.
 * Use this to test the full workflow or to do a manual pull.
 * Run with: node run-once.js
 */
require('dotenv').config();
const { runLeadGeneration } = require('./src/leadGenerator');

runLeadGeneration()
  .then((result) => {
    if (result.success) {
      console.log(`\nSuccess! Added ${result.added} new lead(s).`);
    } else {
      console.error(`\nRun failed at phase "${result.phase || 'unknown'}": ${result.error}`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
