/**
 * Core workflow logic.
 *
 * 1. Fetch contacts from Apollo.io
 * 2. Read existing business names from the spreadsheet
 * 3. Filter duplicates and contacts with no phone
 * 4. Append new rows up to MAX_LEADS_PER_RUN
 */

const { searchApolloContacts, extractContactFields } = require("./apollo");
const { getExistingBusinessNames, appendRows, ensureHeaderRow } = require("./sheets");
const { SHEET_COLUMNS } = require("./config");

/**
 * Run one lead-generation pass.
 * Returns a summary object: { added, skippedDuplicates, skippedNoPhone, total }
 */
async function runLeadGen() {
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || "25", 10);

  // Make sure the header row exists
  await ensureHeaderRow(SHEET_COLUMNS);

  // Load names already in the sheet to prevent duplicates
  const existingNames = await getExistingBusinessNames();
  console.log(`  Existing businesses in sheet: ${existingNames.size}`);

  // Fetch from Apollo — request more than maxLeads to account for duplicates/no-phone
  const rawContacts = await searchApolloContacts(Math.min(maxLeads * 2, 100));
  console.log(`  Apollo returned: ${rawContacts.length} raw contacts`);

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/New_York",
  });

  const newRows = [];
  let skippedDuplicates = 0;
  let skippedNoPhone = 0;

  for (const raw of rawContacts) {
    if (newRows.length >= maxLeads) break;

    const contact = extractContactFields(raw);

    if (!contact) {
      skippedNoPhone++;
      continue;
    }

    const nameKey = contact.businessName.toLowerCase();
    if (!nameKey || existingNames.has(nameKey)) {
      skippedDuplicates++;
      continue;
    }

    // Build the row in SHEET_COLUMNS order
    newRows.push([
      today,                  // Date Added
      contact.businessName,   // Business Name
      contact.firstName,      // Owner First Name
      contact.lastName,       // Owner Last Name
      contact.phone,          // Phone Number
      contact.city,           // City
      contact.website,        // Website
      "",                     // Called   (blank — user fills)
      "",                     // Notes    (blank — user fills)
    ]);

    // Track so we don't re-add a name found later in the same batch
    existingNames.add(nameKey);
  }

  if (newRows.length > 0) {
    await appendRows(newRows);
  }

  return {
    added: newRows.length,
    skippedDuplicates,
    skippedNoPhone,
    total: rawContacts.length,
  };
}

module.exports = { runLeadGen };
