const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

let sheetsClient = null; // cached after first auth

/**
 * Authenticates with Google using a Service Account credentials file.
 * The service account must have Editor access to the target spreadsheet.
 */
async function getAuthClient() {
  const credPath = path.resolve(config.google.credentialsFile);

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      `Create a Service Account and download its JSON key. See README for instructions.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth.getClient();
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const authClient = await getAuthClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return sheetsClient;
}

/**
 * Reads all existing rows from the spreadsheet.
 * Returns a 2D array (rows × columns), skipping the header row.
 */
async function readExistingRows() {
  const sheets = await getSheetsClient();
  const range = `${config.google.sheetName}!A:I`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range,
  });

  const values = response.data.values || [];
  // Row 0 is the header — return everything after it
  return values.slice(1);
}

/**
 * Extracts all unique business names already in the sheet (lowercased for comparison).
 * Used for duplicate detection before appending new rows.
 */
async function getExistingBusinessNames() {
  const rows = await readExistingRows();
  const bizCol = config.colIndex.bizName;

  return new Set(
    rows
      .map((row) => (row[bizCol] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Ensures the header row exists. If the sheet is empty, writes the column headers first.
 * Safe to call on every run — won't overwrite existing data.
 */
async function ensureHeaders() {
  const sheets = await getSheetsClient();
  const range = `${config.google.sheetName}!A1:I1`;

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range,
  });

  const firstRow = existing.data.values?.[0];
  if (firstRow && firstRow.length > 0) {
    // Headers already in place — nothing to do
    return;
  }

  logger.info('Sheet appears empty — writing column headers');
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [config.columns] },
  });
}

/**
 * Appends an array of lead rows to the bottom of the spreadsheet.
 * Each row must be an array matching the column order in config.columns.
 *
 * @param {Array<Array<string>>} rows - Rows to append
 */
async function appendRows(rows) {
  if (!rows || rows.length === 0) return 0;

  const sheets = await getSheetsClient();
  const range = `${config.google.sheetName}!A:I`;

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  const updated = response.data.updates?.updatedRows || rows.length;
  logger.info(`Appended ${updated} new rows to spreadsheet`);
  return updated;
}

/**
 * Converts a lead object (from apollo.js) into a spreadsheet row array.
 * Column order matches config.columns exactly.
 *
 * @param {Object} lead
 * @returns {Array<string>}
 */
function leadToRow(lead) {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Order must match config.columns: Date Added, Business Name, First, Last, Phone, City, Website, Called, Notes
  return [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — intentionally blank
    '', // Notes — intentionally blank
  ];
}

/**
 * Lightweight connectivity check. Reads spreadsheet metadata.
 * Returns the spreadsheet title on success, throws on failure.
 */
async function testConnection() {
  if (!config.google.spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set. Check your .env file.');
  }

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId: config.google.spreadsheetId,
    fields: 'properties.title,sheets.properties.title',
  });

  const title = response.data.properties?.title || '(untitled)';
  const sheetNames = response.data.sheets?.map((s) => s.properties.title) || [];

  if (!sheetNames.includes(config.google.sheetName)) {
    throw new Error(
      `Sheet tab "${config.google.sheetName}" not found in spreadsheet "${title}". ` +
      `Available tabs: ${sheetNames.join(', ')}. ` +
      `Update GOOGLE_SHEET_NAME in your .env file.`
    );
  }

  logger.info(`Google Sheets connection OK — spreadsheet: "${title}", tab: "${config.google.sheetName}"`);
  return title;
}

module.exports = {
  ensureHeaders,
  getExistingBusinessNames,
  appendRows,
  leadToRow,
  testConnection,
};
