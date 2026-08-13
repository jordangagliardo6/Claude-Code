/**
 * sheets.js
 * Google Sheets client using a Service Account (no interactive OAuth needed).
 *
 * Spreadsheet columns (1-indexed, A=1):
 *   A  Date Added
 *   B  Business Name
 *   C  Owner First Name
 *   D  Owner Last Name
 *   E  Phone Number
 *   F  City
 *   G  Website
 *   H  Called          ← left blank for you to fill in
 *   I  Notes           ← left blank for you to fill in
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SHEET_HEADERS = [
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

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ?? './google-credentials.json';
  const resolved = path.resolve(keyPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Google credentials file not found at: ${resolved}\n` +
      'See README.md → "Google Sheets Setup" for how to create it.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

function sheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads all existing Business Name values from column B (skipping the header).
 * Returns a Set<string> of lowercase names for fast O(1) duplicate lookup.
 */
async function getExistingBusinessNames() {
  const auth = getAuth();
  const sheets = sheetsClient(auth);
  const spreadsheetId = requireSpreadsheetId();
  const tabName = process.env.GOOGLE_SHEETS_TAB_NAME ?? 'Leads';

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!B:B`, // Business Name column only
    });

    const rows = res.data.values ?? [];

    // Row 0 is the header; skip it. Normalise to lowercase for comparison.
    const names = rows.slice(1).map((row) => (row[0] ?? '').toLowerCase().trim());
    return new Set(names);
  } catch (err) {
    throw new Error(`Failed to read existing leads from sheet: ${err.message}`);
  }
}

/**
 * Ensures the header row exists. If the sheet is empty it writes the headers.
 * Safe to call on every run.
 */
async function ensureHeaders() {
  const auth = getAuth();
  const sheets = sheetsClient(auth);
  const spreadsheetId = requireSpreadsheetId();
  const tabName = process.env.GOOGLE_SHEETS_TAB_NAME ?? 'Leads';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:I1`,
  });

  const existing = res.data.values?.[0] ?? [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_HEADERS] },
    });
    console.log('[Sheets] Header row written');
  }
}

/**
 * Appends an array of lead rows to the sheet.
 * Each lead must be an array matching the column order above.
 */
async function appendLeads(rows) {
  if (!rows.length) return;

  const auth = getAuth();
  const sheets = sheetsClient(auth);
  const spreadsheetId = requireSpreadsheetId();
  const tabName = process.env.GOOGLE_SHEETS_TAB_NAME ?? 'Leads';

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    console.log(`[Sheets] Appended ${rows.length} new lead(s)`);
  } catch (err) {
    throw new Error(`Failed to append leads to sheet: ${err.message}`);
  }
}

/**
 * Quick connectivity test — just reads spreadsheet metadata.
 * Returns the spreadsheet title on success, throws on failure.
 */
async function testConnection() {
  const auth = getAuth();
  const sheets = sheetsClient(auth);
  const spreadsheetId = requireSpreadsheetId();

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties?.title ?? '(untitled)';
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function requireSpreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set in .env');
  return id;
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendLeads, testConnection };
