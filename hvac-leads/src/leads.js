'use strict';

/**
 * Lead processing and deduplication
 *
 * Sits between the Apollo client and the Sheets client.
 * Filters, deduplicates, and returns only the leads that should be written.
 */

/**
 * Filters an array of normalized leads against a Set of already-known
 * business names. Comparison is case-insensitive and strips extra whitespace.
 *
 * @param {object[]}    leads         - Leads from apollo.fetchLeads()
 * @param {Set<string>} existingNames - Lowercase names already in the sheet
 * @returns {object[]}                - Leads not yet in the sheet
 */
function deduplicateLeads(leads, existingNames) {
  return leads.filter((lead) => {
    const key = lead.businessName.toLowerCase().trim();
    if (!key) return false; // Drop leads with no business name
    return !existingNames.has(key);
  });
}

/**
 * Deduplicates within the batch itself so we don't try to insert the same
 * company twice in the same run (e.g., multiple contacts at the same firm).
 * Keeps the first occurrence (highest-priority title, per apollo.js sort order).
 *
 * @param {object[]} leads - Already filtered leads
 * @returns {object[]}
 */
function deduplicateWithinBatch(leads) {
  const seen = new Set();
  return leads.filter((lead) => {
    const key = lead.businessName.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Full deduplication pipeline: removes leads already in the sheet AND
 * collapses duplicates within the current batch.
 *
 * @param {object[]}    leads         - Raw leads from Apollo
 * @param {Set<string>} existingNames - Existing business names from the sheet
 * @param {number}      limit         - Maximum leads to return
 * @returns {object[]}
 */
function filterNewLeads(leads, existingNames, limit) {
  const unique = deduplicateWithinBatch(leads);
  const novel  = deduplicateLeads(unique, existingNames);
  return novel.slice(0, limit);
}

/**
 * Builds a human-readable summary string for logging.
 *
 * @param {object[]} leads - Final leads to be written
 * @returns {string}
 */
function summarizeLeads(leads) {
  if (!leads.length) return 'No new leads to add.';
  return leads
    .map(
      (l, i) =>
        `  ${i + 1}. ${l.businessName} — ${l.firstName} ${l.lastName} (${l.title || 'unknown title'}) — ${l.phone} — ${l.city}`
    )
    .join('\n');
}

module.exports = { filterNewLeads, summarizeLeads };
