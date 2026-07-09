'use strict';

/**
 * Google Sheets module.
 *
 * Authentication: uses a Service Account JSON key file placed at
 *   credentials/service-account.json
 *
 * The service account must be granted "Editor" access to your spreadsheet
 * (Share the sheet with the service account's email address).
 *
 * See SETUP.md → Step 2 for how to create the service account.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const CREDENTIALS_PATH = path.resolve(__dirname, '..', 'credentials', 'service-account.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Build and return an authenticated Google Sheets client.
 * Throws with a clear message if credentials are missing.
 */
async function getSheetsClient() {
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  }

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Service account file not found at:\n  ${CREDENTIALS_PATH}\n` +
      'See SETUP.md → Step 2 for setup instructions.'
    );
  }

  const auth = new google.auth.GoogleAuth({ keyFile: CREDENTIALS_PATH, scopes: SCOPES });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Read all values in column B (Business Name) and return them as a lowercase Set.
 * Used to identify duplicates before appending.
 *
 * @param {string} tabName - Sheet tab name.
 * @returns {Set<string>} Lowercased business names already in the sheet.
 */
async function getExistingNames(tabName) {
  const sheets = await getSheetsClient();

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tabName}'!B:B`,
  });

  const rows = resp.data.values || [];
  // Slice off the header row (index 0)
  return new Set(rows.slice(1).map(r => (r[0] || '').toLowerCase().trim()));
}

/**
 * Write the header row to row 1 if the sheet is currently empty.
 * Safe to call on every run — it's a no-op if headers already exist.
 *
 * @param {string} tabName  - Sheet tab name.
 * @param {string[]} columns - Column headers in order.
 */
async function ensureHeaders(tabName, columns) {
  const sheets = await getSheetsClient();

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tabName}'!A1:Z1`,
  });

  if (!resp.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [columns] },
    });
    console.log('   [Sheets] Header row created.');
  }
}

/**
 * Append lead rows to the sheet below existing data.
 * Column order must match config.SHEET_COLUMNS / the toRow() output in apollo.js.
 *
 * @param {string}   tabName - Sheet tab name.
 * @param {Object[]} leads   - Array of flat lead objects from apollo.toRow().
 * @returns {number} Number of rows appended.
 */
async function appendRows(tabName, leads) {
  if (!leads.length) return 0;

  const sheets = await getSheetsClient();

  // Map each lead object to an array matching the column order:
  // A=dateAdded, B=businessName, C=firstName, D=lastName,
  // E=phone, F=city, G=website, H=called, I=notes
  const rows = leads.map(l => [
    l.dateAdded,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website,
    l.called,
    l.notes,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tabName}'!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { getExistingNames, ensureHeaders, appendRows };
