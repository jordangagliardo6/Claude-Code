/**
 * workflow.js
 * Orchestrates one complete lead-generation run:
 *   1. Fetch existing business names from the sheet (for dedup).
 *   2. Page through Apollo results until MAX_LEADS_PER_RUN new leads are found.
 *   3. Normalize & filter leads (must have phone number, must not be a dup).
 *   4. Append new leads to the sheet.
 *   5. On any failure, log the error and send an email alert.
 */

const logger  = require('./logger');
const apollo  = require('./apollo');
const sheets  = require('./sheets');
const config  = require('./config');

/**
 * Format today's date as MM/DD/YYYY for the "Date Added" column.
 */
function todayString() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Convert a normalized lead object into a spreadsheet row array.
 * Column order must match config.columnHeaders exactly.
 *
 * Columns: Date Added | Business Name | First Name | Last Name |
 *          Phone Number | City | Website | Called (blank) | Notes (blank)
 */
function buildRow(lead) {
  return [
    todayString(),        // A — Date Added
    lead.businessName,    // B — Business Name  (dedup key)
    lead.firstName,       // C — Owner First Name
    lead.lastName,        // D — Owner Last Name
    lead.phoneNumber,     // E — Phone Number
    lead.city,            // F — City
    lead.website,         // G — Website
    '',                   // H — Called (you fill in)
    '',                   // I — Notes  (you fill in)
  ];
}

/**
 * Run one full lead-generation cycle.
 * Returns a summary object describing what happened.
 */
async function runWorkflow() {
  const summary = { added: 0, skippedDup: 0, skippedNoPhone: 0, pages: 0, error: null };

  try {
    logger.info('=== Lead gen run started ===');

    // ── Step 1: ensure headers exist in the sheet ──────────────────────────
    await sheets.ensureHeaderRow();

    // ── Step 2: load existing business names for dedup ─────────────────────
    const existingNames = await sheets.getExistingNames();

    // ── Step 3: page through Apollo until we hit the lead cap ──────────────
    const newRows = [];
    let page = 1;
    let keepPaging = true;

    while (keepPaging && newRows.length < config.maxLeadsPerRun) {
      const { people, totalCount } = await apollo.searchPeople(page);
      summary.pages++;

      if (people.length === 0) {
        logger.info('Apollo returned 0 results — stopping pagination.');
        break;
      }

      for (const person of people) {
        if (newRows.length >= config.maxLeadsPerRun) break;

        // Normalize and filter for phone number.
        const lead = apollo.normalizePerson(person);
        if (!lead) {
          summary.skippedNoPhone++;
          continue;
        }

        // Skip if the business is already in the sheet.
        const nameKey = lead.businessName.toLowerCase();
        if (!nameKey || existingNames.has(nameKey)) {
          summary.skippedDup++;
          continue;
        }

        // Accept this lead.
        existingNames.add(nameKey); // guard against same business appearing twice in one run
        newRows.push(buildRow(lead));
        logger.info(`  + Queued: "${lead.businessName}" — ${lead.firstName} ${lead.lastName} — ${lead.phoneNumber}`);
      }

      // Stop paging if Apollo has no more results or we've gone past page 10.
      const fetched = (page * config.apolloPageSize);
      if (fetched >= totalCount || page >= 10) keepPaging = false;
      page++;
    }

    // ── Step 4: write to sheet ─────────────────────────────────────────────
    if (newRows.length > 0) {
      await sheets.appendRows(newRows);
      summary.added = newRows.length;
    } else {
      logger.warn('No new leads found this run (all were duplicates or had no phone).');
    }

    logger.info(
      `=== Run complete — added: ${summary.added}, ` +
      `skipped (dup): ${summary.skippedDup}, ` +
      `skipped (no phone): ${summary.skippedNoPhone} ===`
    );

  } catch (err) {
    summary.error = err;
    logger.error('Workflow failed', err);

    const errorMsg =
      `The lead-gen workflow encountered an error and may not have written new leads to your sheet.\n\n` +
      `Error: ${err.message || err}\n\n` +
      `Check logs/errors.log for the full stack trace.`;

    // Determine whether this was an Apollo failure or a Sheets failure.
    const source = /apollo|api\.apollo/i.test(err.message || '')
      ? 'Apollo.io API'
      : /spreadsheet|google|sheets/i.test(err.message || '')
        ? 'Google Sheets API'
        : 'Unknown source';

    await logger.sendAlert(`Workflow error — ${source}`, errorMsg);
  }

  return summary;
}

module.exports = { runWorkflow };
