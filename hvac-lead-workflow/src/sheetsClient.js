/**
 * sheetsClient.js
 *
 * Handles all Google Sheets operations:
 *   - Authenticating via a service account key file
 *   - Reading existing business names (for duplicate detection)
 *   - Appending new lead rows
 *   - Creating the header row on a blank sheet
 *
 * COLUMN ORDER (matches the spreadsheet):
 *   A: Date Added
 *   B: Business Name
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called          ← left blank
 *   I: Notes           ← left blank
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Returns an authenticated Google Sheets client.
 * Reads credentials from the path in GOOGLE_SERVICE_ACCOUNT_KEY_FILE.
 */
function getAuthClient() {
  const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFilePath) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set. Add it to your .env file.'
    );
  }

  const absolutePath = path.resolve(keyFilePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Service account key file not found at: ${absolutePath}\n` +
      'See SETUP.md for instructions on creating a Google service account.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: absolutePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) {
    throw new Error(
      'GOOGLE_SPREADSHEET_ID is not set. Add it to your .env file.\n' +
      'Find it in your spreadsheet URL: .../spreadsheets/d/SPREADSHEET_ID/edit'
    );
  }
  return id;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || 'Leads';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verifies that auth + spreadsheet access works.
 * Throws a descriptive error if anything is misconfigured.
 */
async function verifyConnection() {
  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const id     = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  return {
    title: meta.data.properties.title,
    sheets: meta.data.sheets.map(s => s.properties.title),
  };
}

/**
 * Returns a Set of business names already in the spreadsheet (lower-cased).
 * Used for fast duplicate detection.
 */
async function getExistingBusinessNames() {
  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const id     = getSheetName();
  const spreadsheetId = getSpreadsheetId();

  // Column B = Business Name. Start from row 2 to skip the header.
  const range = `${id}!B2:B`;

  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
  } catch (err) {
    // A 400 on an empty sheet is fine — just means no data yet.
    if (err.code === 400 || err.status === 400) return new Set();
    throw wrapSheetsError(err, 'reading existing business names');
  }

  const rows = response.data.values || [];
  // Flatten and normalise so comparison is case-insensitive.
  return new Set(rows.flat().map(name => String(name).toLowerCase().trim()));
}

/**
 * Ensures the header row exists. If the sheet is empty it writes the headers.
 * Safe to call on every run — it's a no-op if the header is already there.
 */
async function ensureHeader() {
  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetName    = getSheetName();
  const spreadsheetId = getSpreadsheetId();

  // Check A1 to see if a header is already present.
  const checkRange = `${sheetName}!A1`;
  let existing;
  try {
    existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: checkRange,
    });
  } catch {
    existing = { data: { values: [] } };
  }

  const hasHeader = (existing.data.values || []).length > 0;
  if (hasHeader) return; // already set up

  const headers = [
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

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  } catch (err) {
    throw wrapSheetsError(err, 'writing header row');
  }
}

/**
 * Appends an array of Lead objects as new rows.
 *
 * @param {Lead[]} leads - leads that have already been de-duplicated
 * @returns {number}     - number of rows actually appended
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetName    = getSheetName();
  const spreadsheetId = getSpreadsheetId();

  const today = formatDate(new Date());

  // Build a 2-D array matching our column order A–I.
  const rows = leads.map(lead => [
    today,               // A: Date Added
    lead.businessName,   // B: Business Name
    lead.firstName,      // C: Owner First Name
    lead.lastName,       // D: Owner Last Name
    lead.phone,          // E: Phone Number
    lead.city,           // F: City
    lead.website,        // G: Website
    '',                  // H: Called (blank)
    '',                  // I: Notes (blank)
  ]);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
  } catch (err) {
    throw wrapSheetsError(err, 'appending leads');
  }

  return rows.length;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function wrapSheetsError(err, context) {
  const detail = err.errors?.[0]?.message || err.message || String(err);
  return new Error(`Google Sheets error while ${context}: ${detail}`);
}

module.exports = {
  verifyConnection,
  getExistingBusinessNames,
  ensureHeader,
  appendLeads,
};
