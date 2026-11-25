/**
 * Google Sheets integration — reads and appends HVAC leads.
 *
 * Authentication uses a Google Service Account JSON key file.
 * The service account email must be granted "Editor" access to your spreadsheet.
 *
 * Sheet column layout (must match the spreadsheet header row exactly):
 *   A: Date Added | B: Business Name | C: Owner First Name | D: Owner Last Name
 *   E: Phone Number | F: City | G: Website | H: Called | I: Notes
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Column indices (0-based) — update here if you add/reorder columns
const COLUMNS = {
  dateAdded: 0,
  businessName: 1,
  firstName: 2,
  lastName: 3,
  phone: 4,
  city: 5,
  website: 6,
  called: 7,  // left blank by the script
  notes: 8,   // left blank by the script
};

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

let _sheetsClient = null;

/**
 * Returns an authenticated Google Sheets client (lazy singleton).
 */
async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/google-service-account.json');

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Service account key not found at: ${keyPath}\n` +
      `See README — create a service account in Google Cloud Console and ` +
      `save the JSON key to that path.`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

/**
 * Ensures the header row exists on the first run.
 * Safe to call every run — skips if the sheet already has content.
 */
async function ensureHeaderRow(sheets, spreadsheetId, tabName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:I1`,
  });

  const firstRow = (result.data.values || [])[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    console.log('Created header row in spreadsheet.');
  }
}

/**
 * Returns a Set of all business names already in the sheet (lowercase, trimmed).
 * Used to skip duplicates before inserting.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, tabName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Column B = Business Name (index 1 → column B)
    range: `${tabName}!B2:B`,
  });

  const rows = result.data.values || [];
  const names = new Set();
  for (const row of rows) {
    if (row[0]) names.add(row[0].trim().toLowerCase());
  }
  return names;
}

/**
 * Appends new leads to the spreadsheet, skipping duplicates.
 *
 * @param {Array} leads - Contacts from Apollo
 * @returns {Promise<{added: number, skipped: number}>}
 */
async function appendLeads(leads) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tabName = process.env.GOOGLE_SHEET_TAB || 'Leads';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID environment variable is not set.');
  }

  await ensureHeaderRow(sheets, spreadsheetId, tabName);

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId, tabName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const nameKey = lead.businessName.trim().toLowerCase();

    if (!nameKey) {
      skipped++;
      continue; // skip contacts with no business name
    }

    if (existingNames.has(nameKey)) {
      console.log(`  Skipping duplicate: ${lead.businessName}`);
      skipped++;
      continue;
    }

    // Build row in column order — blank strings for Called and Notes
    const row = new Array(HEADER_ROW.length).fill('');
    row[COLUMNS.dateAdded] = today;
    row[COLUMNS.businessName] = lead.businessName;
    row[COLUMNS.firstName] = lead.firstName;
    row[COLUMNS.lastName] = lead.lastName;
    row[COLUMNS.phone] = lead.phone;
    row[COLUMNS.city] = lead.city;
    row[COLUMNS.website] = lead.website;

    newRows.push(row);
    existingNames.add(nameKey); // prevent dupes within the same batch
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:I`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

/**
 * Quick connectivity check — just reads the sheet metadata.
 * Returns the spreadsheet title on success, throws on failure.
 */
async function testConnection() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const result = await sheets.spreadsheets.get({ spreadsheetId });
  return result.data.properties.title;
}

module.exports = { appendLeads, testConnection, HEADER_ROW };
