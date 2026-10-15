/**
 * leadProcessor.js
 *
 * Transforms Apollo contact objects into spreadsheet rows
 * and filters out duplicates.
 */

/**
 * Maps one Apollo contact to a 9-element array matching the sheet columns:
 * [Date Added, Business Name, First, Last, Phone, City, Website, Called, Notes]
 */
function mapLeadToRow(contact) {
  return [
    getTodayDate(),
    contact.organization?.name || '',
    contact.first_name || '',
    contact.last_name || '',
    extractBestPhone(contact.phone_numbers),
    contact.city || contact.organization?.city || '',
    contact.organization?.website_url || '',
    '', // Called — filled in manually
    '', // Notes — filled in manually
  ];
}

/**
 * Filters contacts to only those whose organization name
 * is NOT already in the sheet's existingNames Set.
 */
function deduplicateLeads(contacts, existingNames) {
  return contacts.filter((contact) => {
    const orgName = contact.organization?.name?.toLowerCase().trim();
    return orgName && !existingNames.has(orgName);
  });
}

/**
 * Picks the most useful phone number from Apollo's array.
 * Preference: direct_phone → mobile_phone → mobile → first available.
 */
function extractBestPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return '';

  const PREFERRED = ['direct_phone', 'mobile_phone', 'mobile'];
  const best =
    phoneNumbers.find((p) => PREFERRED.includes(p.type)) || phoneNumbers[0];

  return best.sanitized_number || best.raw_number || '';
}

function getTodayDate() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

module.exports = { mapLeadToRow, deduplicateLeads };
