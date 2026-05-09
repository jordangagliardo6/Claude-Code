const { searchHVACLeads }      = require('./apollo');
const { appendLeads }          = require('./sheets');
const { sendErrorNotification } = require('./notifier');
const logger                   = require('./logger');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10);

/**
 * Core workflow: search Apollo → deduplicate → write to Google Sheets.
 * All errors are caught, logged, and trigger a notification.
 *
 * @returns {Promise<{success: boolean, leadsFound?: number, leadsAdded?: number, elapsed?: string, error?: string}>}
 */
async function runLeadGenerationWorkflow() {
  const t0 = Date.now();
  logger.info('─────────────────────────────────────────');
  logger.info('Starting HVAC lead generation workflow', { maxLeads: MAX_LEADS });

  // ── Step 1: Search Apollo ──────────────────────────────────────────────────
  let leads = [];
  try {
    logger.info('Searching Apollo.io for HVAC leads in Southwest Michigan…');
    leads = await searchHVACLeads(MAX_LEADS);
  } catch (err) {
    logger.error('Apollo.io search failed', { error: err.message });
    await sendErrorNotification(
      'Apollo.io Search Failed',
      `The Apollo.io search encountered an error and no leads were fetched.\n\nError:\n${err.message}`
    );
    return { success: false, error: err.message };
  }

  if (leads.length === 0) {
    const msg = 'Apollo.io returned 0 results. All matching leads may have been exhausted, or the filters need adjusting.';
    logger.warn(msg);
    await sendErrorNotification(
      'No Results from Apollo.io',
      msg + '\n\nPossible causes:\n' +
      '• All leads in the target area have already been pulled\n' +
      '• The industry/title filters are too narrow\n' +
      '• Temporary Apollo.io issue — try running manually later'
    );
    return { success: true, leadsFound: 0, leadsAdded: 0 };
  }

  logger.info(`Found ${leads.length} lead(s) from Apollo.io`);

  // ── Step 2: Write to Google Sheets ────────────────────────────────────────
  let added = 0;
  try {
    logger.info('Writing leads to Google Sheets…');
    added = await appendLeads(leads);
  } catch (err) {
    logger.error('Google Sheets write failed', { error: err.message });

    const leadSummary = leads
      .map(l => `• ${l.businessName} — ${l.phone} (${l.city})`)
      .join('\n');

    await sendErrorNotification(
      'Google Sheets Write Failed',
      `Successfully fetched ${leads.length} lead(s) from Apollo.io, but writing to Google Sheets failed.\n\n` +
      `Error:\n${err.message}\n\n` +
      `Leads that were NOT saved:\n${leadSummary}`
    );
    return { success: false, error: err.message };
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  const elapsed   = ((Date.now() - t0) / 1000).toFixed(1);
  const skipped   = leads.length - added;
  const summary   = `${added} new lead(s) added${skipped > 0 ? `, ${skipped} duplicate(s) skipped` : ''} in ${elapsed}s`;

  logger.success(`Workflow complete: ${summary}`);
  logger.info('─────────────────────────────────────────');

  return { success: true, leadsFound: leads.length, leadsAdded: added, skipped, elapsed: `${elapsed}s` };
}

module.exports = { runLeadGenerationWorkflow };
