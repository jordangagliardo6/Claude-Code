/**
 * Google Sheets client for reading and appending leads.
 * Authenticates via a service account JSON key (best for cron jobs).
 *
 * The target spreadsheet columns (in order):
 *   A: Date Added
 *   B: Business Name      <-- used for deduplication
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called             (left blank by this script)
 *   I: Notes              (left blank by this script)
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SHEET_NAME = 'Sheet1'; // Change if your sheet tab has a different name
const DATA_RANGE = `${SHEET_NAME}!A:I`;
const BUSINESS_NAME_COLUMN = `${SHEET_NAME}!B:B`;

/**
 * Build a Google Sheets client authenticated as a service account.
 * Tries GOOGLE_SERVICE_ACCOUNT_JSON env var first, then the key file path.
 */
function buildSheetsClient() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    const keyFilePath = path.resolve(
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './service-account-key.json'
    );
    if (!fs.existsSync(keyFilePath)) {
      throw new Error(
        `Google service account key file not found at: ${keyFilePath}\n` +
        'Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE in your .env file.'
      );
    }
    credentials = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all existing Business Names from column B (lowercase for comparison).
 * Returns a Set of normalized business names already in the sheet.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: BUSINESS_NAME_COLUMN,
  });

  const rows = response.data.values || [];
  // rows[0] is the header "Business Name" — skip it
  const names = rows.slice(1).map((row) => (row[0] || '').toLowerCase().trim());
  return new Set(names);
}

/**
 * Append an array of lead rows to the sheet.
 * Each item in `rows` must be an array matching the column order A–I.
 */
async function appendLeadRows(sheets, spreadsheetId, rows) {
  if (!rows.length) return;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: DATA_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Ensure the header row exists. Writes it only if column A row 1 is blank.
 */
async function ensureHeaderRow(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:I1`,
  });

  const existing = (response.data.values || [])[0];
  if (existing && existing[0]) return; // Header already present

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:I1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
        'Phone Number', 'City', 'Website', 'Called', 'Notes',
      ]],
    },
  });
}

/**
 * Format today's date as MM/DD/YYYY for the "Date Added" column.
 */
function todayFormatted() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

module.exports = {
  buildSheetsClient,
  getExistingBusinessNames,
  appendLeadRows,
  ensureHeaderRow,
  todayFormatted,
};
