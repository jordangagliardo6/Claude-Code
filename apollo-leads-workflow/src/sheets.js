/**
 * Google Sheets integration for reading and appending lead rows.
 *
 * Authentication: Uses a Google service account JSON key file.
 * The service account must have Editor access to the spreadsheet.
 *
 * Sheet columns (must match exactly, row 1 headers):
 *   A: Date Added
 *   B: Business Name
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called        (left blank by this script)
 *   I: Notes         (left blank by this script)
 */

const { google } = require('googleapis');
const fs = require('fs');

const SHEET_NAME = 'Sheet1'; // change if your tab is named differently
const HEADER_ROW = 1;        // row number of the column headers

/**
 * Build an authenticated Google Sheets client using a service account.
 *
 * @param {string} keyFilePath  Path to the service account JSON file
 * @returns {Promise<import('googleapis').sheets_v4.Sheets>}
 */
async function getSheetsClient(keyFilePath) {
  const keyFile = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Read all existing Business Names from column B to enable duplicate checking.
 *
 * @param {object} sheets      Authenticated Sheets client
 * @param {string} spreadsheetId
 * @returns {Promise<Set<string>>} Lowercased business names already in the sheet
 */
async function readExistingBusinessNames(sheets, spreadsheetId) {
  // Read column B (Business Name) starting after the header row
  const range = `${SHEET_NAME}!B${HEADER_ROW + 1}:B`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values ?? [];
  const names = new Set(
    rows.flatMap((row) => row).map((name) => name.trim().toLowerCase())
  );

  console.log(`[Sheets] Found ${names.size} existing businesses in the sheet`);
  return names;
}

/**
 * Append new lead rows to the bottom of the sheet.
 * Each lead becomes one row in the order: Date Added, Business Name,
 * Owner First Name, Owner Last Name, Phone Number, City, Website, Called, Notes.
 *
 * @param {object}  sheets         Authenticated Sheets client
 * @param {string}  spreadsheetId
 * @param {Array}   leads          Filtered leads to append
 * @returns {Promise<number>}      Number of rows appended
 */
async function appendLeads(sheets, spreadsheetId, leads) {
  if (leads.length === 0) {
    console.log('[Sheets] No new leads to append');
    return 0;
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const rows = leads.map((lead) => [
    today,
    lead.companyName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website ?? '',
    '',  // Called — left blank for manual tracking
    '',  // Notes — left blank
  ]);

  const range = `${SHEET_NAME}!A:I`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new leads`);
  return rows.length;
}

/**
 * Verify connection to the spreadsheet by reading its title.
 * Called during the test-connection script.
 *
 * @param {object} sheets
 * @param {string} spreadsheetId
 * @returns {Promise<string>} Spreadsheet title
 */
async function verifyConnection(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.get({ spreadsheetId });
  return response.data.properties.title;
}

module.exports = {
  getSheetsClient,
  readExistingBusinessNames,
  appendLeads,
  verifyConnection,
};
