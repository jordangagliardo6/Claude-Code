/**
 * Manual one-shot run — skips the scheduler and executes immediately.
 * Useful for testing and for pulling leads on demand.
 *
 * Usage: npm run run-now
 */

require('dotenv').config();
const { fetchHvacLeads } = require('./apollo');
const { appendLeads }    = require('./sheets');
const logger             = require('./logger');

(async () => {
  logger.info('═══ Manual Run Triggered ═══');

  try {
    const leads = await fetchHvacLeads();

    if (!leads || leads.length === 0) {
      logger.warn('No qualifying leads found. Check your Apollo filters or account plan.');
      process.exit(0);
    }

    const added = await appendLeads(leads);
    logger.info(`Done — ${added} new lead(s) added to the spreadsheet.`);
  } catch (err) {
    logger.error('Manual run failed', err);
    process.exit(1);
  }
})();
