/**
 * Duplicate detection: compare incoming leads against names already in the sheet.
 *
 * Matching is case-insensitive and strips common suffixes (LLC, Inc, Co, etc.)
 * to catch "Smith HVAC LLC" vs "Smith HVAC" as the same company.
 */

const STRIP_SUFFIXES = /\s*(,?\s*(llc|inc|co|corp|ltd|company|services|solutions|mechanical|heating|cooling|air|hvac)\.?)+$/gi;

function normalize(name) {
  return name
    .toLowerCase()
    .replace(STRIP_SUFFIXES, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return only the leads whose normalized business name does NOT appear
 * in the existing set pulled from the sheet.
 *
 * @param {Array}    incoming         New leads from Apollo
 * @param {Set}      existingNames    Lowercased names already in the sheet
 * @returns {Array}  Leads that are genuinely new
 */
function filterDuplicates(incoming, existingNames) {
  // Also normalize the existing set for comparison
  const normalizedExisting = new Set(
    [...existingNames].map(normalize)
  );

  const fresh = incoming.filter((lead) => {
    const key = normalize(lead.companyName);
    if (!key) return false; // skip leads with no company name
    return !normalizedExisting.has(key);
  });

  const skipped = incoming.length - fresh.length;
  if (skipped > 0) {
    console.log(`[Dedup] Skipped ${skipped} duplicate(s)`);
  }
  return fresh;
}

module.exports = { filterDuplicates };
