// ============================================================
// Google Sheets Client
// Reads existing leads and appends new ones.
// Spreadsheet must already exist — share it with your Google account.
// ============================================================

require('dotenv').config();
const { google } = require('googleapis');
const config = require('./config');

function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

// Returns the spreadsheet range string, e.g. "Sheet1!A:B"
function range(cols) {
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
  return `${tab}!${cols}`;
}

// Fetches all values in the Business Name column (column B).
// Used to detect duplicates before inserting new leads.
async function getExistingBusinessNames(auth) {
  const sheets  = getSheetsClient(auth);
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in the .env file.');
  }

  const colLetter = columnIndexToLetter(config.columns.businessName);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: range(`${colLetter}:${colLetter}`),
  });

  const rows = res.data.values || [];
  // rows[0] is the header — skip it; normalise to lowercase for comparison.
  return rows.slice(1).map(r => (r[0] || '').toLowerCase().trim());
}

// Appends an array of lead objects as new rows.
// Each lead: { businessName, firstName, lastName, phone, city, website }
async function appendLeads(auth, leads) {
  if (leads.length === 0) return;

  const sheets  = getSheetsClient(auth);
  const sheetId = process.env.GOOGLE_SHEET_ID;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const rows = leads.map(lead => {
    const row = new Array(config.headerRow.length).fill('');
    row[config.columns.dateAdded]    = today;
    row[config.columns.businessName] = lead.businessName;
    row[config.columns.firstName]    = lead.firstName;
    row[config.columns.lastName]     = lead.lastName;
    row[config.columns.phone]        = lead.phone;
    row[config.columns.city]         = lead.city;
    row[config.columns.website]      = lead.website;
    // columns.called and columns.notes left blank intentionally
    return row;
  });

  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// Creates the header row if the sheet appears to be empty.
async function ensureHeaderRow(auth) {
  const sheets  = getSheetsClient(auth);
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab     = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:Z1`,
  });

  const firstRow = (res.data.values || [])[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [config.headerRow] },
    });
    console.log('Header row created in spreadsheet.');
  }
}

// Utility: convert 0-indexed column number to letter (0→A, 1→B, …)
function columnIndexToLetter(index) {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

module.exports = { getExistingBusinessNames, appendLeads, ensureHeaderRow };
