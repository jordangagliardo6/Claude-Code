/**
 * workflow.js — Main orchestration logic.
 *
 * runWorkflow() is called by the cron scheduler (index.js) and can also
 * be invoked directly via `npm run run-now` for manual testing.
 */

const logger = require('./logger');
const config = require('./config');
const { searchLeads, extractLeads, deduplicateByCompany } = require('./apollo');
const { getAuthClient, ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');

/**
 * Fire-and-forget alert. Always logs to console + error log.
 * Extend this function to add email or Slack notifications.
 *
 * @param {string} subject - Short description of the problem
 * @param {string} detail  - Full error message or context
 */
function sendAlert(subject, detail) {
  const alertEmail = process.env.ALERT_EMAIL;
  logger.error(`ALERT — ${subject}: ${detail}`);

  console.error('\n' + '═'.repeat(60));
  console.error(`ALERT: ${subject}`);
  console.error(detail);
  if (alertEmail) {
    console.error(`\nNotification should be sent to: ${alertEmail}`);
    console.error('(To enable email alerts, install nodemailer and configure');
    console.error(' SMTP settings — see README for instructions.)');
  }
  console.error('═'.repeat(60) + '\n');
}

/**
 * Execute one full lead-generation run:
 *   1. Connect to Google Sheets
 *   2. Load existing business names (for dedup)
 *   3. Search Apollo across pages until we have enough candidates
 *   4. Deduplicate by company, remove existing entries
 *   5. Write up to maxLeadsPerRun new rows to the spreadsheet
 */
async function runWorkflow() {
  logger.info('══ Lead generation run starting ══');
  const t0 = Date.now();

  // ── Step 1: Google Sheets connection ──────────────────────────────
  let auth;
  try {
    auth = await getAuthClient();
    await ensureHeaders(auth);
    logger.info('Google Sheets: connected.');
  } catch (err) {
    sendAlert('Google Sheets connection failed', err.message);
    return;
  }

  // ── Step 2: Load existing entries for duplicate detection ──────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(auth);
    logger.info(`Spreadsheet has ${existingNames.size} existing business(es).`);
  } catch (err) {
    sendAlert('Failed to read spreadsheet', err.message);
    return;
  }

  // ── Step 3: Pull leads from Apollo ────────────────────────────────
  const candidates = [];
  let page = 1;

  while (candidates.length < config.maxLeadsPerRun * 3 && page <= config.maxApolloPages) {
    let apolloData;
    try {
      apolloData = await searchLeads(page);
    } catch (err) {
      sendAlert('Apollo API error', err.message);
      break;
    }

    if (!apolloData.people?.length) {
      logger.info('Apollo returned no more results.');
      break;
    }

    const pageCandidates = extractLeads(apolloData);
    logger.info(`Page ${page}: ${pageCandidates.length} candidates in target area (of ${apolloData.people.length} total).`);
    candidates.push(...pageCandidates);

    const totalPages = apolloData.pagination?.total_pages ?? 1;
    if (page >= totalPages) break;
    page++;
  }

  if (!candidates.length) {
    sendAlert(
      'No Apollo results',
      'Apollo returned zero matching leads for Southwest Michigan HVAC companies. ' +
      'The search filters may need adjustment, or the API quota may be exhausted.'
    );
    return;
  }

  logger.info(`Total candidates collected: ${candidates.length}`);

  // ── Step 4: Deduplicate and filter against existing spreadsheet ────
  const uniqueByCompany = deduplicateByCompany(candidates);
  logger.info(`After company deduplication: ${uniqueByCompany.length} unique companies.`);

  const newLeads = uniqueByCompany.filter(lead => {
    const key = lead.businessName.toLowerCase().trim();
    return key && !existingNames.has(key);
  });

  logger.info(`New leads not yet in spreadsheet: ${newLeads.length}`);

  if (!newLeads.length) {
    logger.info('Nothing new to add — all candidates already exist in the spreadsheet.');
    return;
  }

  // ── Step 5: Write up to maxLeadsPerRun rows ────────────────────────
  const batch = newLeads.slice(0, config.maxLeadsPerRun);

  try {
    await appendLeads(auth, batch);
  } catch (err) {
    sendAlert('Spreadsheet write failed', err.message);
    return;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logger.info(`══ Run complete — added ${batch.length} lead(s) in ${elapsed}s ══`);
}

module.exports = { runWorkflow };
