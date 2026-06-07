/**
 * One-shot test runner.
 * Executes the full lead-gen workflow immediately — no waiting for 7am.
 * Use this to verify your Apollo and Google Sheets connections before the
 * first scheduled run.
 *
 * Usage:  node run-now.js
 */

require('dotenv').config();
const { run } = require('./src/runner');

(async () => {
  try {
    await run();
    process.exit(0);
  } catch (err) {
    console.error('\nRun failed:', err.message);
    process.exit(1);
  }
})();
