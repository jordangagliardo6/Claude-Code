/**
 * index.js — Run the lead generation workflow once immediately.
 * Use this for testing or manual runs:
 *
 *   node index.js
 *
 * For the automated 7am daily schedule, use:
 *
 *   node scheduler.js
 */
require('dotenv').config();
const { runWorkflow } = require('./src/workflow');

(async () => {
  try {
    const result = await runWorkflow();
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('[Fatal] Unexpected error:', err.message);
    process.exit(1);
  }
})();
