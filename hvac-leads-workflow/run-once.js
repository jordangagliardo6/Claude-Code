/**
 * Run one lead generation cycle immediately and exit.
 * Use this for testing or a manual on-demand pull.
 *
 *   node run-once.js
 */

require('dotenv').config();

const { runLeadGeneration } = require('./run-leads');
const { alertError } = require('./logger');

(async () => {
  try {
    const result = await runLeadGeneration();
    console.log('\nResult:', result);
    process.exit(0);
  } catch (err) {
    await alertError('run-once.js failed', err.message + '\n' + err.stack);
    process.exit(1);
  }
})();
