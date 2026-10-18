// Google Sheets API client (using service account credentials)
// Docs: https://developers.google.com/sheets/api/reference/rest

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Builds and returns an authenticated Sheets API client.
function getSheetsClient() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const resolved = path.resolve(credPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Google credentials file not found at: ${resolved}\n` +
      'See SETUP.md for instructions on creating a service account.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Returns the full range string for the sheet, e.g. "Untitled!A:B".
function range(sheetName, cols) {
  return `${sheetName}!${cols}`;
}

// Reads all existing Business Name values (column B) from the sheet.
// Returns a Set of lowercased, trimmed names for O(1) duplicate lookups.
async function getExistingBusinessNames(config) {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID || config.sheets.spreadsheetId;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: range(config.sheets.sheetName, 'B:B'),
  });

  const rows = response.data.values || [];
  const names = new Set();

  // rows[0] is the header "Business Name" — skip it.
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim().toLowerCase();
    if (name) names.add(name);
  }

  return names;
}

// Appends an array of lead rows to the spreadsheet.
// Each row must be an array matching the column order in config.sheets.columns.
async function appendRows(rows, config) {
  if (rows.length === 0) return 0;

  const sheets = getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID || config.sheets.spreadsheetId;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    // Append after the last row in columns A–I.
    range: range(config.sheets.sheetName, 'A:I'),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// Converts a normalized lead object into a row array matching the sheet columns.
function leadToRow(lead) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return [
    today,             // A: Date Added
    lead.businessName, // B: Business Name
    lead.firstName,    // C: Owner First Name
    lead.lastName,     // D: Owner Last Name
    lead.phone,        // E: Phone Number
    lead.city,         // F: City
    lead.website,      // G: Website
    '',                // H: Called  (blank — user fills in)
    '',                // I: Notes   (blank — user fills in)
  ];
}

module.exports = { getExistingBusinessNames, appendRows, leadToRow };
