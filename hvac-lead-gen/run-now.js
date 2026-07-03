/**
 * run-now.js
 * Triggers one immediate lead generation run without waiting for the 7am cron.
 * Use this to test the workflow or pull leads on demand.
 *
 * Usage:  node run-now.js
 */

'use strict';

require('dotenv').config();

const { runLeadGen } = require('./run-lead-gen');

(async () => {
  console.log('[run-now] Starting immediate lead gen run…\n');
  try {
    const summary = await runLeadGen();
    process.exit(summary.error ? 1 : 0);
  } catch (err) {
    console.error('[run-now] Fatal error:', err.message);
    process.exit(1);
  }
})();
