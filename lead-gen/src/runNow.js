/**
 * runNow.js
 * Triggers a single workflow run immediately — useful for testing
 * or manually pulling leads outside the scheduled window.
 *
 * Usage:  npm run run-now
 */

'use strict';

require('dotenv').config();

const { runWorkflow } = require('./workflow');

const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `\nERROR: Missing required environment variable(s): ${missing.join(', ')}\n` +
    `Copy .env.example to .env and fill in the values, then retry.\n`
  );
  process.exit(1);
}

runWorkflow().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
