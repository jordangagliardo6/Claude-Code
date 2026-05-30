'use strict';

/**
 * One-shot runner — executes the workflow immediately without starting the
 * scheduler.  Useful for manual runs or testing.
 *
 * Usage:  node run-once.js
 */

require('dotenv').config();
const { runWorkflow } = require('./src/workflow');

runWorkflow()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[run-once] Fatal error:', err.message);
    process.exit(1);
  });
