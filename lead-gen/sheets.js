/**
 * sheets.js — Google Sheets integration.
 *
 * Uses a Service Account for authentication — ideal for unattended automation.
 *
 * Setup summary (full details in setup.js --help output):
 *   1. Create a Google Cloud project and enable the Google Sheets API.
 *   2. Create a Service Account and download its JSON key.
 *   3. Save the key as: lead-gen/credentials/serviceAccountKey.json
 *   4. Share your spreadsheet with the service account email (Editor access).
 *   5. Set GOOGLE_SHEET_ID in your .env file.
 */

const { google }  = require('googleapis');
const path        = require('path');
const fs          = require('fs');
const config      = require('./config');

/**
 * Build an authenticated Google Sheets client using the service account key.
 * The key file path is read from GOOGLE_SERVICE_ACCOUNT_KEY env var.
 *
 * @returns {import('googleapis').sheets_v4.Sheets}
 */
function getSheetsClient() {
  const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Service account key not found at: ${keyPath}\n` +
      `Run "node setup.js" for step-by-step instructions.`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes:  ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all business names already in the sheet (column B) and return them
 * as a lowercase Set for fast O(1) dedup checks.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const sheets        = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab           = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!${config.sheets.businessNameRange}`,
  });

  const rows = response.data.values || [];
  // Row 0 is the header — skip it; normalize remaining values for comparison
  return new Set(
    rows.slice(1)
      .map((row) => (row[0] || '').toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Append an array of lead objects to the bottom of the spreadsheet.
 * Leaves "Called" and "Notes" columns blank for manual use.
 *
 * @param {Object[]} leads - Normalized lead objects from apollo.js
 * @returns {Promise<number>} Number of rows appended
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets        = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab           = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day:   '2-digit',
    year:  'numeric',
  });

  const rows = leads.map((lead) => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website || '',
    '',  // Called  — intentionally blank
    '',  // Notes   — intentionally blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:            `${tab}!${config.sheets.dataRange}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: rows },
  });

  return rows.length;
}

/**
 * Write column headers to row 1 if the sheet appears to be empty.
 * Safe to call on every run — skips if headers already exist.
 *
 * @returns {Promise<boolean>} true if headers were written, false if already present
 */
async function ensureHeaders() {
  const sheets        = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab           = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:I1`,
  });

  const existingRow = (response.data.values || [])[0] || [];

  if (existingRow.length > 0) {
    // Headers already present — nothing to do
    return false;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range:            `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: [config.sheets.columns] },
  });

  console.log('[Sheets] Column headers written to row 1.');
  return true;
}

/**
 * Quick connectivity check — fetches spreadsheet metadata to confirm
 * the service account has access.  Throws on auth/permission failure.
 *
 * @returns {Promise<string>} Spreadsheet title on success
 */
async function testConnection() {
  const sheets        = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const response = await sheets.spreadsheets.get({ spreadsheetId });
  return response.data.properties?.title || '(untitled)';
}

module.exports = { getExistingBusinessNames, appendLeads, ensureHeaders, testConnection };
