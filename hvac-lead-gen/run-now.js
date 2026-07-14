/**
 * One-shot runner — execute a full workflow cycle immediately.
 * Use this to test the workflow or to run it manually outside the schedule.
 *
 * Usage:  npm run run-now   (or: node run-now.js)
 */

require('dotenv').config();
const { runWorkflow } = require('./src/workflow');

(async () => {
  try {
    const result = await runWorkflow();
    console.log('\nSummary:', result);
    process.exit(0);
  } catch (err) {
    console.error('\nRun failed:', err.message);
    process.exit(1);
  }
})();
