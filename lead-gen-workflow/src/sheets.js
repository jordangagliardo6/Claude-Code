/**
 * sheets.js
 * Google Sheets API client (v4) using a service account for authentication.
 *
 * The service account credentials JSON lives at GOOGLE_CREDENTIALS_PATH.
 * The target spreadsheet must be shared with the service account's email address
 * (see README.md, step 3).
 *
 * Operations:
 *   - ensureHeaderRow()     — creates headers on first use if the sheet is empty
 *   - getExistingNames()    — returns a Set of business names already in the sheet
 *   - appendRows(rows)      — appends new rows below all existing data
 */

const { google } = require('googleapis');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

/**
 * Build and return an authenticated Sheets API client.
 * Reuse across calls within the same process (lazy singleton).
 */
let _sheetsClient = null;

async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const credPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json');

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

/**
 * Returns the full A1 range string for a given tab, e.g. "Leads!A:I"
 */
function tabRange(suffix) {
  return `${config.sheetTabName}!${suffix}`;
}

/**
 * If the sheet has no data at all, write the header row.
 * Safe to call on every run — does nothing if headers already exist.
 */
async function ensureHeaderRow() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabRange('A1:Z1'),
  });

  const existingRow = (result.data.values || [])[0] || [];
  if (existingRow.length > 0) {
    logger.info('Header row already present — skipping header write.');
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: tabRange('A1'),
    valueInputOption: 'RAW',
    requestBody: { values: [config.columnHeaders] },
  });

  logger.info('Header row written to sheet.');
}

/**
 * Fetch every value in the Business Name column (column B, index 1) and
 * return a Set of lowercased names for O(1) dedup lookups.
 */
async function getExistingNames() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // Read column B (business name) from row 2 onward (skip header).
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabRange('B2:B'),
  });

  const rows = result.data.values || [];
  const names = new Set();
  for (const row of rows) {
    if (row[0]) names.add(row[0].trim().toLowerCase());
  }

  logger.info(`Found ${names.size} existing businesses in sheet.`);
  return names;
}

/**
 * Append an array of row arrays to the bottom of the sheet.
 * Uses valueInputOption USER_ENTERED so dates/URLs render correctly.
 *
 * @param {string[][]} rows - Each inner array is one spreadsheet row.
 */
async function appendRows(rows) {
  if (!rows || rows.length === 0) {
    logger.info('No rows to append.');
    return;
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: tabRange('A1'),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  const updated = response.data.updates?.updatedRows || rows.length;
  logger.info(`Appended ${updated} new row(s) to sheet.`);
}

module.exports = { ensureHeaderRow, getExistingNames, appendRows };
