/**
 * src/sheets.js — Google Sheets read/write via the googleapis SDK.
 *
 * Authentication: Google Service Account (JSON key file or inline JSON env var).
 * Share your spreadsheet with the service account's client_email to grant write access.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { google } = require('googleapis');
const config = require('../config');

const SHEET_NAME = 'Sheet1'; // default tab name; update if you rename the tab

/** Build an authenticated Google Sheets client */
async function getSheetsClient() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Inline JSON string in env var
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    credentials = require(
      require('path').resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE)
    );
  } else {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON or ' +
        'GOOGLE_SERVICE_ACCOUNT_KEY_FILE in your .env file.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/** Return the spreadsheet ID from env */
function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID is not set in your .env file.');
  return id;
}

/**
 * Ensure the header row exists. Writes it if the sheet is empty.
 */
async function ensureHeaders(sheets) {
  const sheetId = getSheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A1:${columnLetter(config.SHEET_HEADERS.length)}1`,
  });

  const existingRow = res.data.values?.[0];
  if (!existingRow || existingRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.SHEET_HEADERS] },
    });
    console.log('  ✓ Header row written to sheet.');
  }
}

/**
 * Fetch all existing business names from column B (index 1) for duplicate detection.
 * Returns a Set of lowercased business names.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const sheetId = getSheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!B2:B`, // Column B = Business Name, skip header
  });

  const rows = res.data.values || [];
  const names = new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
  return names;
}

/**
 * Append an array of lead rows to the sheet.
 * Each row must be ordered to match config.SHEET_HEADERS.
 *
 * @param {Array<Array<string>>} rows - 2-D array of cell values
 * @returns {Promise<number>} - count of rows appended
 */
async function appendLeads(rows) {
  if (rows.length === 0) return 0;

  const sheets = await getSheetsClient();
  await ensureHeaders(sheets);

  const sheetId = getSheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/** Convert a 1-based column number to a letter (1→A, 2→B, …, 26→Z) */
function columnLetter(n) {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

module.exports = { getExistingBusinessNames, appendLeads };
