/**
 * run-now.js — Run the lead generation workflow immediately (no scheduler).
 *
 * Use this to:
 *   • Test that your credentials work before the first scheduled run
 *   • Manually trigger an extra pull any time
 *
 * Usage:
 *   node run-now.js
 */

require('dotenv').config();
const log = require('./logger');
const { runLeadWorkflow } = require('./run-leads');

(async () => {
  try {
    const result = await runLeadWorkflow();
    if (result.error) {
      log.error('Manual run', result.error);
      process.exit(1);
    }
    log.info(`Done — ${result.added} new lead(s) added to your sheet.`);
    process.exit(0);
  } catch (err) {
    log.error('Unexpected error', err);
    process.exit(1);
  }
})();
