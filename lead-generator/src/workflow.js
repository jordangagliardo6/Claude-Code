const { searchLeads, extractLeadData } = require('./apolloClient');
const { appendLeads } = require('./sheetsClient');
const { sendErrorNotification } = require('./notifier');
const { LEADS_PER_RUN } = require('./config');
const logger = require('./logger');

/**
 * Full lead-generation run:
 *  1. Search Apollo.io for HVAC contacts in SW Michigan
 *  2. Filter to contacts with a phone number
 *  3. Append new (non-duplicate) rows to Google Sheet
 */
async function runLeadGeneration() {
  logger.info('========== Lead generation run started ==========');

  try {
    // ---- Step 1: Pull leads from Apollo --------------------------------
    const people = await searchLeads(LEADS_PER_RUN);

    if (!people || people.length === 0) {
      const msg = 'Apollo.io returned no results for the current search criteria.';
      logger.warn(msg);
      await sendErrorNotification(msg);
      return;
    }

    // ---- Step 2: Extract fields, drop contacts with no phone -----------
    const leads = people.map(extractLeadData).filter(Boolean);

    logger.info(
      `${leads.length}/${people.length} contact(s) have phone numbers and will be processed.`
    );

    if (leads.length === 0) {
      const msg = 'Apollo returned contacts but none had a phone number.';
      logger.warn(msg);
      await sendErrorNotification(msg);
      return;
    }

    // ---- Step 3: Append to Google Sheet (dedup inside) -----------------
    const added = await appendLeads(leads);

    logger.info(`========== Run complete: ${added} new lead(s) added ==========`);
  } catch (err) {
    logger.error('Lead generation run failed', err);
    await sendErrorNotification(`Lead generation run failed: ${err.message}`);
  }
}

module.exports = { runLeadGeneration };
