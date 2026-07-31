/**
 * Google Sheets API v4 client.
 *
 * Uses a service account credentials JSON file (GOOGLE_CREDENTIALS_PATH).
 * See setup.md for instructions on creating a service account and sharing
 * your spreadsheet with it.
 *
 * To change the target spreadsheet, update SPREADSHEET_ID in your .env file.
 * To add or reorder columns, update COLUMNS and the appendLeads row-builder below.
 */

const { google } = require('googleapis');
const path = require('path');

// ─── Easy-to-modify configuration ────────────────────────────────────────────

const SPREADSHEET_ID = process.env.SPREADSHEET_ID
  || '1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk';

// The sheet tab name inside the spreadsheet.
const SHEET_NAME = 'Sheet1';

// Full column range (A through I = 9 columns matching the header row).
const FULL_RANGE = `${SHEET_NAME}!A:I`;

// Header row — change order here if you restructure the spreadsheet columns.
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

// ─────────────────────────────────────────────────────────────────────────────

function buildAuth() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH
    || path.join(__dirname, '..', 'credentials.json');

  return new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Returns all existing Business Name values from column B (row 2 onward).
 * Used to detect duplicates before inserting new leads.
 */
async function getExistingBusinessNames() {
  const sheets = google.sheets({ version: 'v4', auth: buildAuth() });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B:B`, // Business Name is column B
  });

  const rows = res.data.values ?? [];
  return rows
    .slice(1) // skip the header row
    .map(row => (row[0] ?? '').trim())
    .filter(Boolean);
}

/**
 * Ensures the header row exists in the spreadsheet.
 * Safe to call every run — only writes if row 1 is empty.
 */
async function ensureHeaderRow() {
  const sheets = google.sheets({ version: 'v4', auth: buildAuth() });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:I1`,
  });

  const existingHeader = res.data.values?.[0] ?? [];
  if (existingHeader.length > 0) return; // header already present

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [HEADER_ROW] },
  });

  console.log('Header row written to spreadsheet.');
}

/**
 * Appends an array of lead objects as new rows at the bottom of the sheet.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @param {string} dateAdded  Human-readable date string, e.g. "7/31/2026"
 */
async function appendLeads(leads, dateAdded) {
  const sheets = google.sheets({ version: 'v4', auth: buildAuth() });

  const rows = leads.map(lead => [
    dateAdded,          // A – Date Added
    lead.businessName,  // B – Business Name
    lead.firstName,     // C – Owner First Name
    lead.lastName,      // D – Owner Last Name
    lead.phone,         // E – Phone Number
    lead.city,          // F – City
    lead.website,       // G – Website
    '',                 // H – Called (blank — filled in manually)
    '',                 // I – Notes  (blank — filled in manually)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: FULL_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: rows },
  });
}

module.exports = { getExistingBusinessNames, ensureHeaderRow, appendLeads };
