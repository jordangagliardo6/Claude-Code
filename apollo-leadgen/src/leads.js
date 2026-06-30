/**
 * Turns raw Apollo "person" records into the flat lead shape the sheet wants,
 * and handles ranking/dedup so we keep the best matches when there are more
 * candidates than maxLeadsPerRun.
 */

function extractPhone(person) {
  // Apollo can surface a number in a few different places depending on
  // whether it came from the org record or a verified personal reveal.
  if (person.phone_numbers && person.phone_numbers.length > 0) {
    return person.phone_numbers[0].sanitized_number || person.phone_numbers[0].raw_number;
  }
  if (person.organization && person.organization.phone) {
    return person.organization.phone;
  }
  return null;
}

function toLead(person, fallbackCity) {
  const phone = extractPhone(person);
  if (!phone) return null; // exclude contacts with no phone number, per requirements

  const businessName = person.organization ? person.organization.name : null;
  if (!businessName) return null;

  return {
    businessName,
    ownerFirstName: person.first_name || '',
    ownerLastName: person.last_name || '',
    phone,
    city: (person.city || fallbackCity || '').split(',')[0].trim(),
    website: (person.organization && person.organization.website_url) || '',
    title: person.title || '',
  };
}

/**
 * Rank leads by title priority (earlier entries in titlesByPriority win),
 * de-duplicate by business name (case-insensitive), and skip any business
 * name already present in the sheet.
 */
function rankAndDedupe(rawLeads, { titlesByPriority, existingBusinessNames, maxLeads }) {
  const existing = new Set(Array.from(existingBusinessNames).map((n) => n.trim().toLowerCase()));
  const seenThisRun = new Set();
  const titleRank = (title) => {
    const idx = titlesByPriority.findIndex((t) => title.toLowerCase().includes(t.toLowerCase()));
    return idx === -1 ? titlesByPriority.length : idx;
  };

  const deduped = [];
  for (const lead of rawLeads) {
    if (!lead) continue;
    const key = lead.businessName.trim().toLowerCase();
    if (existing.has(key) || seenThisRun.has(key)) continue;
    seenThisRun.add(key);
    deduped.push(lead);
  }

  deduped.sort((a, b) => titleRank(a.title) - titleRank(b.title));

  return deduped.slice(0, maxLeads);
}

module.exports = { toLead, rankAndDedupe };
