const { fetchQualifiedLeads } = require('./apollo');
const { initSheets, appendLeads } = require('./sheets');
const { loadState, saveState } = require('./state');
const { sendErrorNotification } = require('./notifier');
const logger = require('./logger');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// Searches Apollo across multiple pages if needed to collect enough new leads.
async function collectNewLeads(existingNames, startPage) {
  const newLeads = [];
  let page = startPage;
  let totalEntries = Infinity;
  const maxPage = Math.ceil(totalEntries / 100); // recalculated after first call

  while (newLeads.length < MAX_LEADS) {
    const { leads, totalEntries: total } = await fetchQualifiedLeads(page);
    totalEntries = total;

    for (const lead of leads) {
      if (newLeads.length >= MAX_LEADS) break;

      const key = lead.businessName.toLowerCase().trim();
      if (!existingNames.has(key)) {
        newLeads.push(lead);
        existingNames.add(key); // Prevent intra-batch duplicates
      }
    }

    // If Apollo returned nothing (empty page) or we've exhausted pages, stop
    if (leads.length === 0 || page >= Math.ceil(totalEntries / 100)) {
      logger.info(`Reached end of Apollo results at page ${page} — resetting to page 1 next run`);
      page = 0; // Will be saved as 1 below
      break;
    }

    page++;
  }

  return { newLeads, nextPage: page === 0 ? 1 : page };
}

// Main workflow — called by both the scheduler and run-now.js
async function runLeadGeneration() {
  logger.info('═══ Lead generation run started ═══');

  let state;
  try {
    state = loadState();
    logger.info(`Resuming from Apollo page ${state.lastPage} | Total leads added so far: ${state.totalAdded}`);
  } catch (err) {
    logger.warn(`Could not load state file, starting from page 1: ${err.message}`);
    state = { lastPage: 1, totalAdded: 0 };
  }

  // ── Step 1: Connect to Google Sheets ──────────────────────────────────────
  let sheets, existingNames;
  try {
    ({ sheets, existingNames } = await initSheets());
    logger.info(`Google Sheets ready — ${existingNames.size} existing businesses loaded for deduplication`);
  } catch (err) {
    const msg = `Google Sheets connection failed: ${err.message}`;
    logger.error(msg);
    await sendErrorNotification('Google Sheets write failed', msg);
    return;
  }

  // ── Step 2: Fetch new leads from Apollo ───────────────────────────────────
  let newLeads, nextPage;
  try {
    ({ newLeads, nextPage } = await collectNewLeads(existingNames, state.lastPage));
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    logger.error(msg);

    // Provide useful hints for common errors
    if (err.response?.status === 401) {
      logger.error('→ Check that APOLLO_API_KEY in your .env file is correct.');
    } else if (err.response?.status === 429) {
      logger.error('→ Apollo rate limit hit. The next run will retry automatically.');
    }

    await sendErrorNotification('Apollo search failed', msg);
    return;
  }

  // ── Step 3: Write to Google Sheets ────────────────────────────────────────
  if (newLeads.length === 0) {
    logger.info('No new leads found this run — sheet is up to date.');
  } else {
    try {
      await appendLeads(sheets, newLeads);
    } catch (err) {
      const msg = `Failed to write leads to Google Sheets: ${err.message}`;
      logger.error(msg);
      await sendErrorNotification('Google Sheets write failed', msg);
      return;
    }
  }

  // ── Step 4: Save run state ─────────────────────────────────────────────────
  const totalAdded = state.totalAdded + newLeads.length;
  saveState({
    lastPage: nextPage,
    totalAdded,
    lastRunAt: new Date().toISOString(),
    lastRunAdded: newLeads.length
  });

  logger.info(`═══ Run complete — added ${newLeads.length} lead(s) | Cumulative total: ${totalAdded} ═══`);

  if (newLeads.length > 0) {
    logger.info('Leads added this run:');
    newLeads.forEach((lead, i) => {
      logger.info(`  ${i + 1}. ${lead.businessName} — ${lead.firstName} ${lead.lastName} — ${lead.phone} — ${lead.city}`);
    });
  }
}

module.exports = { runLeadGeneration };
