// googleSheets.js
//
// Reads/writes the lead-tracking spreadsheet that lives in Google Drive.
// Appending rows and checking a single column for duplicates needs the
// Google Sheets API specifically (Drive API alone only manages file
// metadata, not cell contents) -- so this uses googleapis' "sheets" client,
// authenticated with the same Google OAuth credentials/refresh token the
// task asked for.

const { google } = require('googleapis');
const config = require('../config');
const logger = require('./logger');

function getAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Google OAuth env vars are missing (need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN).'
    );
  }
  const oAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID is not set in the environment.');
  return id;
}

// Converts a 1-indexed column number to its A1 letter (1 -> A, 27 -> AA).
function columnToLetter(index) {
  let letter = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function businessNameColumnLetter() {
  const colIndex = config.sheetColumns.indexOf('Business Name') + 1;
  if (colIndex === 0) throw new Error('config.sheetColumns must include "Business Name".');
  return columnToLetter(colIndex);
}

// Returns a Set of lowercased, trimmed business names already in the
// sheet, used to skip duplicates before inserting new leads.
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const col = businessNameColumnLetter();
  const range = `${config.sheetTabName}!${col}2:${col}`; // skip header row

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range,
  });

  const rows = data.values || [];
  return new Set(rows.map((r) => (r[0] || '').trim().toLowerCase()).filter(Boolean));
}

// Appends an array of row arrays (already ordered to match
// config.sheetColumns) to the bottom of the sheet.
async function appendLeads(rows) {
  if (rows.length === 0) return;

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${config.sheetTabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Appended ${rows.length} new lead(s) to the "${config.sheetTabName}" sheet.`);
}

module.exports = { getExistingBusinessNames, appendLeads, getSheetsClient, getSpreadsheetId };
