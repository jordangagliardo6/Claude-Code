require('dotenv').config();

const { fetchLeads }     = require('./apollo');
const { appendLeads }    = require('./sheets');
const { sendErrorAlert } = require('./notify');
const config             = require('./config');
const logger             = require('./logger');

async function runWorkflow() {
  logger.info('══════════════════════════════════════');
  logger.info(' HVAC Lead Gen — workflow started');
  logger.info('══════════════════════════════════════');

  try {
    // Fetch candidates from Apollo — pulls multiple pages and sorts by title priority
    const candidates = await fetchLeads(config.MAX_LEADS_PER_RUN * 3);

    if (candidates.length === 0) {
      const msg = 'Apollo returned 0 leads with phone numbers for the current search criteria.';
      logger.warn(msg);
      await sendErrorAlert('No leads found', msg);
      return 0;
    }

    logger.info(`${candidates.length} candidate(s) with phones — capping at ${config.MAX_LEADS_PER_RUN} before dedup`);

    // Cap before handing to sheets (dedup check happens inside appendLeads)
    const batch = candidates.slice(0, config.MAX_LEADS_PER_RUN);
    const added = await appendLeads(batch);

    logger.info(`══════════════════════════════════════`);
    logger.info(` Workflow complete — ${added} new lead(s) added`);
    logger.info(`══════════════════════════════════════`);
    return added;

  } catch (err) {
    const msg = err.message || String(err);
    logger.error(`Workflow failed: ${msg}`);
    await sendErrorAlert('Workflow failure', msg);
    throw err;
  }
}

// Support direct invocation: `node src/workflow.js` or `npm run run-once`
if (require.main === module) {
  runWorkflow()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runWorkflow };
