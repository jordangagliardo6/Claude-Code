/**
 * run-now.js — Trigger one workflow run immediately (no scheduler).
 *
 * Usage:  node run-now.js
 *
 * Useful for:
 *   • Testing the full pipeline end-to-end
 *   • Back-filling leads manually
 *   • Verifying a fix before the next scheduled run
 */

'use strict';

require('dotenv').config();

const { runWorkflow } = require('./src/workflow');

(async () => {
  console.log('Running workflow immediately (bypassing scheduler)…\n');
  const result = await runWorkflow();
  console.log('\nFinal result:', result);
  process.exit(result.error ? 1 : 0);
})();
