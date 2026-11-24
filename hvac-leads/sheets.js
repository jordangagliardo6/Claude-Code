/**
 * Google Sheets module.
 * Reads existing leads and appends new ones to a sheet named "Leads".
 *
 * Sheet column layout (A–I):
 *   A: Date Added | B: Business Name | C: Owner First Name | D: Owner Last Name
 *   E: Phone Number | F: City | G: Website | H: Called | I: Notes
 */

const { google } = require('googleapis');

const SHEET_TAB = 'Leads';
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
// Columns A through I
const DATA_RANGE = `${SHEET_TAB}!A:I`;
const BUSINESS_NAME_RANGE = `${SHEET_TAB}!B:B`;

/**
 * Create and return an authenticated Google Sheets client.
 *
 * Authentication is resolved in this order:
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY_FILE env var — path to a service account JSON
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var — same, but the standard ADC var
 *   3. Application Default Credentials (gcloud auth application-default login)
 *
 * @returns {Promise<Object>} Authenticated sheets client
 */
async function initSheetsClient() {
  const keyFile =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const authConfig = {
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  };
  if (keyFile) {
    authConfig.keyFile = keyFile;
  }

  const auth = new google.auth.GoogleAuth(authConfig);
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Read all existing business names from column B.
 * Returns a Set of lowercase names for fast duplicate lookups.
 *
 * @param {Object} sheets - Authenticated Sheets client
 * @param {string} spreadsheetId
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: BUSINESS_NAME_RANGE,
  });

  const rows = res.data.values || [];
  const names = new Set();

  // Skip header row (index 0) if present
  const dataRows = rows[0]?.[0] === 'Business Name' ? rows.slice(1) : rows;
  for (const row of dataRows) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }

  return names;
}

/**
 * Append an array of lead objects as new rows.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @param {Object} sheets - Authenticated Sheets client
 * @param {string} spreadsheetId
 * @param {Array} leads
 * @returns {Promise<number>} Number of rows appended
 */
async function appendLeads(sheets, spreadsheetId, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  const rows = leads.map((lead) => [
    today,              // A: Date Added
    lead.businessName,  // B: Business Name
    lead.firstName,     // C: Owner First Name
    lead.lastName,      // D: Owner Last Name
    lead.phone,         // E: Phone Number
    lead.city,          // F: City
    lead.website,       // G: Website
    '',                 // H: Called (blank — user fills in)
    '',                 // I: Notes (blank — user fills in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: DATA_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Create the sheet and write the header row if the spreadsheet is empty.
 * Safe to call multiple times — only writes headers when the sheet is blank.
 *
 * @param {Object} sheets
 * @param {string} spreadsheetId
 */
async function ensureHeaderRow(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A1:I1`,
  });

  const firstRow = (res.data.values || [])[0] || [];
  if (firstRow[0] === 'Date Added') {
    console.log('Header row already present — skipping setup.');
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TAB}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADER_ROW] },
  });

  console.log('Header row written to sheet.');
}

/**
 * Quick connection test — just reads the first cell of the sheet.
 *
 * @param {Object} sheets
 * @param {string} spreadsheetId
 * @returns {Promise<boolean>}
 */
async function testConnection(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A1`,
  });
  // If the call doesn't throw, we have access
  return true;
}

module.exports = {
  initSheetsClient,
  getExistingBusinessNames,
  appendLeads,
  ensureHeaderRow,
  testConnection,
  HEADER_ROW,
};
