/**
 * sheets.js — Google Sheets read/append integration.
 *
 * Uses a Google Service Account (recommended) or OAuth2 credentials.
 * The spreadsheet ID comes from the GOOGLE_SHEET_ID environment variable.
 *
 * Required Google API scope: https://www.googleapis.com/auth/spreadsheets
 */

const { google } = require('googleapis');
const config = require('./config');

const SHEET_NAME = 'Sheet1'; // Change if your tab has a custom name
const HEADER_ROW = 1;        // Row number of the header (1-indexed)

let _sheetsClient = null;

/**
 * Returns an authenticated Google Sheets client (cached after first call).
 */
async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

/**
 * Reads all existing Business Name values from column B (index 1) to build
 * a deduplication set.
 *
 * @returns {Promise<Set<string>>}  Lowercased business names already in sheet
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const spreadsheetId = requireSheetId();

  // Read only column B to keep the request small
  const range = `${SHEET_NAME}!B${HEADER_ROW + 1}:B`;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = resp.data.values || [];
  const names = new Set();
  for (const row of rows) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }
  return names;
}

/**
 * Appends an array of lead objects as new rows at the bottom of the sheet.
 * Skips any lead whose business name is already in existingNames.
 *
 * @param {Array<Object>} leads          Normalized lead objects from apollo.js
 * @param {Set<string>}  existingNames   Lowercased names already in the sheet
 * @returns {Promise<number>}            Number of rows actually appended
 */
async function appendLeads(leads, existingNames) {
  if (!leads.length) return 0;

  const sheets = await getSheetsClient();
  const spreadsheetId = requireSheetId();

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (existingNames.has(key)) continue; // skip duplicate

    // Build row in column order from config.sheetColumns:
    // Date Added | Business Name | First Name | Last Name | Phone | City | Website | Called | Notes
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — intentionally blank
      '', // Notes  — intentionally blank
    ]);

    existingNames.add(key); // prevent dupes within this batch
  }

  if (!newRows.length) return 0;

  const range = `${SHEET_NAME}!A:I`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return newRows.length;
}

/**
 * Ensures the header row exists. Safe to call on every run — it checks
 * whether row 1 is already populated before writing.
 */
async function ensureHeaderRow() {
  const sheets = await getSheetsClient();
  const spreadsheetId = requireSheetId();
  const range = `${SHEET_NAME}!A1:I1`;

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = resp.data.values?.[0];

  // Only write header if row 1 is empty
  if (!existing || !existing.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [config.sheetColumns] },
    });
    console.log('[sheets] Header row written.');
  }
}

/**
 * Validates and returns the spreadsheet ID from env.
 */
function requireSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  return id;
}

module.exports = { ensureHeaderRow, getExistingBusinessNames, appendLeads };
