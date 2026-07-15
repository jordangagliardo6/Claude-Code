/**
 * run-now.js — Execute one lead generation run immediately.
 *
 * Use this to test your setup or pull leads on demand, without waiting
 * for the 7 AM cron trigger.
 *
 *   node run-now.js
 */

require('dotenv').config();
const { runLeadGenJob } = require('./index');

runLeadGenJob()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
