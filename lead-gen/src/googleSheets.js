/**
 * googleSheets.js
 *
 * Reads and writes to the lead-tracking Google Sheet via the
 * Sheets API v4 using a service-account credentials file.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// --- Edit these if you rename the tab or add/remove columns ---
const SHEET_NAME = 'Sheet1';    // Tab name inside the spreadsheet
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
const DATA_RANGE = `${SHEET_NAME}!A:I`;  // All 9 columns

// ---------------------------------------------------------------

function getAuthClient() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const absPath = path.resolve(credPath);

  if (!fs.existsSync(absPath)) {
    throw new Error(
      `Google credentials file not found at: ${absPath}\n` +
        'Set GOOGLE_CREDENTIALS_PATH in .env or place credentials.json in this directory.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(absPath, 'utf8'));

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Returns a Set of existing business names (lowercased) from column B.
 * Used for duplicate detection before appending new rows.
 */
async function getExistingBusinessNames(spreadsheetId) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!B:B`,
  });

  const rows = res.data.values || [];
  const names = new Set();

  // Skip row 1 (header)
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i]?.[0]?.toLowerCase().trim();
    if (name) names.add(name);
  }

  return names;
}

/**
 * Appends an array of row arrays (already formatted) to the sheet.
 */
async function appendLeads(spreadsheetId, rows) {
  if (rows.length === 0) return;

  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: DATA_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: rows },
  });
}

/**
 * Writes the header row to A1 if the sheet is empty.
 * Run once via: node index.js --init-sheet
 */
async function initializeSheet(spreadsheetId) {
  const sheets = await getSheetsClient();

  // Check if row 1 already has content
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
  });

  if (check.data.values?.length) {
    console.log('Sheet already has a header row — skipping init.');
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [HEADER_ROW] },
  });

  console.log('Header row written to Sheet1!A1');
}

/**
 * Lightweight connection test — reads sheet metadata.
 * Returns the spreadsheet title on success.
 */
async function verifyConnection(spreadsheetId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties.title;
}

module.exports = {
  getExistingBusinessNames,
  appendLeads,
  initializeSheet,
  verifyConnection,
};
