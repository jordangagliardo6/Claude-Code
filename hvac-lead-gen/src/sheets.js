/**
 * Google Sheets integration — read existing leads and append new rows.
 *
 * Uses a service account for authentication (no browser OAuth flow needed),
 * which is ideal for scheduled/unattended runs.
 *
 * Sheet column layout (A–I):
 *   A: Date Added  B: Business Name  C: Owner First  D: Owner Last
 *   E: Phone       F: City           G: Website       H: Called (blank)  I: Notes (blank)
 */

const { google } = require('googleapis');
const path = require('path');

// Header row written on first run if the sheet is empty
const HEADER_ROW = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

/**
 * Build an authenticated Google Sheets client using a service account.
 *
 * @param {string} credentialsPath - Path to the service account JSON file
 * @returns {object} Authenticated sheets client
 */
async function getSheetsClient(credentialsPath) {
  const resolvedPath = path.resolve(credentialsPath);
  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Read all existing business names from column B to detect duplicates.
 *
 * @param {object} sheets - Authenticated sheets client
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Promise<Set<string>>} Lowercase business names already in the sheet
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!B:B`; // Column B = Business Name
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const names = new Set();

  // Skip row 1 (header) — start from index 1
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim().toLowerCase();
    if (name) names.add(name);
  }

  return names;
}

/**
 * Ensure the sheet has the header row. If the sheet is completely empty,
 * write the header before appending data.
 *
 * @param {object} sheets
 * @param {string} spreadsheetId
 * @param {string} sheetName
 */
async function ensureHeader(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:I1`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const firstRow = (response.data.values || [])[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    console.log('  Header row written to sheet.');
  }
}

/**
 * Append new lead rows to the sheet, skipping duplicates.
 *
 * @param {object} sheets
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {Array} contacts - Normalized contact objects from Apollo
 * @returns {Promise<{appended: number, skipped: number}>}
 */
async function appendLeads(sheets, spreadsheetId, sheetName, contacts) {
  await ensureHeader(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  const newRows = [];
  let skipped = 0;

  for (const contact of contacts) {
    const normalizedName = contact.businessName.trim().toLowerCase();

    if (!normalizedName) {
      skipped++;
      continue; // Skip contacts with no business name
    }

    if (existing.has(normalizedName)) {
      console.log(`  Skipping duplicate: ${contact.businessName}`);
      skipped++;
      continue;
    }

    newRows.push([
      today,                  // A: Date Added
      contact.businessName,   // B: Business Name
      contact.firstName,      // C: Owner First Name
      contact.lastName,       // D: Owner Last Name
      contact.phone,          // E: Phone Number
      contact.city,           // F: City
      contact.website,        // G: Website
      '',                     // H: Called (blank for user to fill)
      '',                     // I: Notes (blank for user to fill)
    ]);

    // Track in-memory so we don't double-add within the same run
    existing.add(normalizedName);
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:I`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { appended: newRows.length, skipped };
}

module.exports = { getSheetsClient, appendLeads, getExistingBusinessNames };
