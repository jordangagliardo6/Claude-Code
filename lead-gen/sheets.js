/**
 * sheets.js
 * All Google Sheets read/write operations.
 *
 * Authentication uses a Google Service Account JSON key file (see setup guide).
 * Share your spreadsheet with the service account's email address before first run.
 *
 * Column order (do not change without also updating HEADERS + appendLeads()):
 *   A: Date Added  B: Business Name  C: Owner First Name  D: Owner Last Name
 *   E: Phone Number  F: City  G: Website  H: Called  I: Notes
 */

const { google } = require('googleapis');
const path = require('path');

const HEADERS = [
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

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');
  return id;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || 'Sheet1';
}

async function buildSheetsClient() {
  const credPath =
    process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, 'credentials.json');

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * If the sheet is brand new (empty), write the header row so columns are labeled.
 */
async function ensureHeaders(sheets) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const firstRow = res.data.values?.[0];
  if (!firstRow || firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    console.log('Header row written to sheet.');
  }
}

/**
 * Read column B (Business Name) and return a lowercase Set for O(1) duplicate checks.
 */
async function getExistingBusinessNames() {
  const sheets = await buildSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,
  });

  const names = new Set();
  for (const row of res.data.values || []) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }
  return names;
}

/**
 * Append an array of lead objects as new rows at the bottom of the sheet.
 *
 * Each lead must have:
 *   dateAdded, businessName, ownerFirstName, ownerLastName,
 *   phone, city, website
 */
async function appendLeads(leads) {
  if (leads.length === 0) return;

  const sheets = await buildSheetsClient();
  await ensureHeaders(sheets);

  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const rows = leads.map((lead) => [
    lead.dateAdded,
    lead.businessName,
    lead.ownerFirstName,
    lead.ownerLastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank for manual tracking
    '', // Notes  — left blank for manual notes
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Verify Google Sheets connectivity. Returns the spreadsheet title on success.
 */
async function testConnection() {
  const sheets = await buildSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
  });
  return res.data.properties.title;
}

module.exports = { getExistingBusinessNames, appendLeads, testConnection };
