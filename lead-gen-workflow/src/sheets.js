/**
 * sheets.js — Google Sheets API integration.
 *
 * Uses a Service Account (recommended for headless automation).
 * Share your spreadsheet with the service account email address
 * (it looks like name@project.iam.gserviceaccount.com) as an Editor.
 */

const { google } = require('googleapis');
const path       = require('path');
const logger     = require('./logger');
const config     = require('./config');

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Build and return an authenticated Google API client.
 * Reads the service account key file path from GOOGLE_CREDENTIALS_PATH.
 */
async function getAuthClient() {
  const keyFile = process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, '../credentials/service-account.json');

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth.getClient();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify we can reach the spreadsheet. Returns the spreadsheet title.
 * Used by verify.js to confirm connectivity before the first scheduled run.
 */
async function verifyConnection() {
  const auth          = await getAuthClient();
  const sheets        = google.sheets({ version: 'v4', auth });
  const spreadsheetId = requireSpreadsheetId();

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties.title;
}

/**
 * If the first row of the sheet is empty, write the column headers.
 * Safe to call on every run — it's a no-op when headers already exist.
 */
async function ensureHeaders(auth) {
  const sheets        = google.sheets({ version: 'v4', auth });
  const spreadsheetId = requireSpreadsheetId();
  const sheetName     = sheetTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  });

  const firstRow = (res.data.values ?? [[]])[0];
  if (!firstRow?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.spreadsheet.headers] },
    });
    logger.info('Header row written to spreadsheet.');
  }
}

/**
 * Read the Business Name column (column B) and return a lowercase Set
 * of every existing value. Used to prevent duplicate entries.
 */
async function getExistingBusinessNames(auth) {
  const sheets        = google.sheets({ version: 'v4', auth });
  const spreadsheetId = requireSpreadsheetId();
  const sheetName     = sheetTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Column B = Business Name (index 1). Adjust if you reorder columns.
    range: `${sheetName}!B:B`,
  });

  const rows = res.data.values ?? [];
  // rows[0] is the header ("Business Name"), skip it.
  return new Set(
    rows.slice(1).map(row => (row[0] ?? '').toLowerCase().trim()).filter(Boolean)
  );
}

/**
 * Append an array of lead objects as new rows in the spreadsheet.
 * Returns the number of rows actually written.
 *
 * @param {object} auth   - Authenticated Google API client
 * @param {Array}  leads  - Array of lead objects from apollo.js
 */
async function appendLeads(auth, leads) {
  if (!leads.length) return 0;

  const sheets        = google.sheets({ version: 'v4', auth });
  const spreadsheetId = requireSpreadsheetId();
  const sheetName     = sheetTab();

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  // Build rows that match the column order in config.spreadsheet.headers.
  const rows = leads.map(lead => [
    today,             // Date Added
    lead.businessName, // Business Name
    lead.firstName,    // Owner First Name
    lead.lastName,     // Owner Last Name
    lead.phone,        // Phone Number
    lead.city,         // City
    lead.website,      // Website
    '',                // Called  (intentionally blank)
    '',                // Notes   (intentionally blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Wrote ${leads.length} new lead(s) to spreadsheet.`);
  return leads.length;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  return id;
}

function sheetTab() {
  return process.env.GOOGLE_SHEET_NAME || 'Sheet1';
}

module.exports = {
  getAuthClient,
  verifyConnection,
  ensureHeaders,
  getExistingBusinessNames,
  appendLeads,
};
