// ─── Manual One-Off Run ───────────────────────────────────────────────────────
// Runs the workflow immediately without waiting for the 7am cron trigger.
// Useful for testing or manually pulling leads on demand.
// Usage: node run-now.js

require('dotenv').config();

const { runWorkflow } = require('./workflow');

runWorkflow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  });
