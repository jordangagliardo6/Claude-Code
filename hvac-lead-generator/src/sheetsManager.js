'use strict';

/**
 * Google Sheets integration
 *
 * Authentication: Google service account (JSON key file).
 * The service account must have "Editor" access to the target spreadsheet.
 *
 * Setup steps:
 *   1. Go to Google Cloud Console → APIs & Services → Enable "Google Sheets API"
 *   2. Create a service account (IAM & Admin → Service Accounts)
 *   3. Download the JSON key → save its path in GOOGLE_SERVICE_ACCOUNT_KEY_PATH
 *   4. Open your spreadsheet → Share → add the service account email (Editor)
 */

const { google } = require('googleapis');
const path       = require('path');
const logger     = require('./logger');

// Column order matches the sheet header exactly.
// If you add/remove columns, update this array AND the header row in your sheet.
const COLUMN_ORDER = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank by this script)
  'Notes',            // I  (left blank by this script)
];

const BUSINESS_NAME_COL_INDEX = COLUMN_ORDER.indexOf('Business Name'); // 1 (0-based)

// ─── Auth ─────────────────────────────────────────────────────────────────

function buildAuthClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set in .env');

  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(keyPath),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

// ─── Public helpers ───────────────────────────────────────────────────────

/**
 * Verify credentials and return the spreadsheet title.
 * @returns {Promise<string>} Spreadsheet title
 */
async function verifySheetsConnection() {
  const auth   = buildAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const res    = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  });
  return res.data.properties?.title || 'Unknown';
}

/**
 * Read all existing Business Name values from column B (after the header row).
 * Used to detect duplicates before inserting.
 * @returns {Promise<Set<string>>} Lowercase-normalised set of existing business names
 */
async function getExistingBusinessNames() {
  const auth      = buildAuthClient();
  const sheets    = google.sheets({ version: 'v4', auth });
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  // Read only column B to keep the request small
  const range = `'${sheetName}'!B2:B`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  const names = new Set(
    rows.flat().map(name => String(name).toLowerCase().trim()).filter(Boolean)
  );
  logger.debug(`Existing business names in sheet: ${names.size}`);
  return names;
}

/**
 * Append an array of lead objects as new rows in the spreadsheet.
 * Does NOT check for duplicates — call getExistingBusinessNames() first.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {Promise<number>} Number of rows actually appended
 */
async function appendLeads(leads) {
  if (leads.length === 0) {
    logger.info('No new leads to append.');
    return 0;
  }

  const auth      = buildAuthClient();
  const sheets    = google.sheets({ version: 'v4', auth });
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  const today     = formatDate(new Date());

  // Build 2-D array matching COLUMN_ORDER
  const rows = leads.map(lead => [
    today,               // Date Added
    lead.businessName,   // Business Name
    lead.firstName,      // Owner First Name
    lead.lastName,       // Owner Last Name
    lead.phone,          // Phone Number
    lead.city,           // City
    lead.website,        // Website
    '',                  // Called (blank)
    '',                  // Notes (blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,  // Sheets API auto-finds the next empty row
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Appended ${rows.length} new lead(s) to "${sheetName}"`);
  return rows.length;
}

/**
 * Ensure the header row exists (idempotent — only writes if A1 is blank).
 * Call this once on first setup or from test-connection.js.
 */
async function ensureHeaderRow() {
  const auth      = buildAuthClient();
  const sheets    = google.sheets({ version: 'v4', auth });
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,
  });

  const existing = check.data.values?.[0]?.[0] || '';
  if (existing.trim().toLowerCase() === 'date added') {
    logger.info('Header row already present — skipping write.');
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [COLUMN_ORDER] },
  });

  logger.info('Header row written to sheet.');
}

// ─── Utilities ────────────────────────────────────────────────────────────

function formatDate(date) {
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  verifySheetsConnection,
  getExistingBusinessNames,
  appendLeads,
  ensureHeaderRow,
  COLUMN_ORDER,
};
