/**
 * Google Sheets integration.
 *
 * Reads existing business names for deduplication, then appends new lead rows.
 * Uses a service account so no browser OAuth is needed for automated runs.
 *
 * Setup: share the spreadsheet (Editor access) with the service account email
 * found in your google-service-account.json file under "client_email".
 */

const { google } = require('googleapis');
const path = require('path');

// Column order must match the spreadsheet header exactly
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank)
  'Notes',            // I  (left blank)
];

let _sheets = null;

/** Returns an authenticated Google Sheets client (cached after first call). */
async function getSheetsClient() {
  if (_sheets) return _sheets;

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!credPath) throw new Error('GOOGLE_CREDENTIALS_PATH is not set in environment');

  const resolvedPath = path.resolve(credPath);
  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/**
 * Returns a Set of business names already in the sheet (column B, lowercased).
 * Used for deduplication — skips row 1 (header).
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME || 'Sheet1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.flat().map(name => name.trim().toLowerCase()));
}

/**
 * Appends an array of lead objects as new rows to the spreadsheet.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {number} Number of rows actually appended
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME || 'Sheet1';
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '',  // Called — blank
    '',  // Notes — blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Verifies credentials and spreadsheet access; returns spreadsheet title.
 * Called during the --test connection check.
 */
async function verifyConnection() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties.title',
  });

  return {
    title: res.data.properties?.title,
    sheets: res.data.sheets?.map(s => s.properties?.title),
  };
}

module.exports = { getExistingBusinessNames, appendLeads, verifyConnection, COLUMNS };
