'use strict';

/**
 * run-once.js — Manual trigger
 *
 * Run this directly to execute one lead generation pass immediately,
 * without waiting for the scheduled time:
 *
 *   node run-once.js
 *
 * Useful for testing, first-run verification, or catching up manually.
 */

require('dotenv').config();
const { runWorkflow } = require('./src/workflow');
const { log, sendErrorEmail } = require('./src/notify');

(async () => {
  try {
    const result = await runWorkflow();
    log(`\nFinal: added=${result.added} | searched=${result.searched} | dupes=${result.skippedDupes} | no-phone=${result.skippedNoPhone}`);
    process.exit(0);
  } catch (err) {
    const msg = err.message || String(err);
    log(`FATAL ERROR: ${msg}`);
    if (err.response?.data) {
      log(`Apollo response: ${JSON.stringify(err.response.data)}`);
    }
    await sendErrorEmail('Manual run failed', msg);
    process.exit(1);
  }
})();
