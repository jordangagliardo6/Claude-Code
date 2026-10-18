// ─── Manual One-Off Run ───────────────────────────────────────────────────────
// Runs the workflow once immediately — useful for testing or catching up.
// Usage: node run-now.js

require('dotenv').config();
const config = require('./config');
const { runLeadGenWorkflow } = require('./src/workflow');
const { notifyError } = require('./src/notify');

(async () => {
  try {
    const result = await runLeadGenWorkflow(config);
    console.log('\nResult:', result);
    process.exit(0);
  } catch (err) {
    notifyError(err, config);
    process.exit(1);
  }
})();
