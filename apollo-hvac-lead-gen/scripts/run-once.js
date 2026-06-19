// Triggers a single workflow run immediately, without waiting for the cron
// schedule. Useful for the first-time test run and for manual re-runs.
require('dotenv').config();
const { runWorkflow } = require('../src/workflow');

runWorkflow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Workflow run failed:', err);
    process.exit(1);
  });
