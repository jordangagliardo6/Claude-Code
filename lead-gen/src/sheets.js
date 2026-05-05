'use strict';

/**
 * Google Sheets integration
 *
 * Reads from and appends rows to an existing Google Sheets spreadsheet.
 * Authentication supports two modes (controlled by env vars):
 *
 *   1. Service Account (recommended for automation):
 *      Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE to the path of your downloaded
 *      service-account JSON file, then share the spreadsheet with the
 *      service-account email (Viewer/Editor).
 *
 *   2. OAuth2 credentials (for personal Google accounts):
 *      Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
 *      Run `node setup.js --auth` once to generate the refresh token.
 *
 * ENV required (pick one auth method):
 *   GOOGLE_SPREADSHEET_ID    – the ID in the spreadsheet URL
 *   GOOGLE_SHEET_NAME        – tab name, defaults to "Leads"
 *
 *   Service Account:
 *     GOOGLE_SERVICE_ACCOUNT_KEY_FILE – path to service account JSON
 *
 *   OAuth2:
 *     GOOGLE_CLIENT_ID
 *     GOOGLE_CLIENT_SECRET
 *     GOOGLE_REFRESH_TOKEN
 */

require('dotenv').config();
const { google } = require('googleapis');
const logger = require('./logger');

// ─── Spreadsheet column layout ────────────────────────────────────────────────
// Edit COLUMNS to rename or reorder headers. The order here matches the order
// in the actual sheet (A, B, C…). Do NOT remove entries — adjust them instead.
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H – left blank for manual entry
  'Notes',            // I – left blank for manual entry
];

const HEADER_ROW = 1; // row that contains column labels
const DATA_START_ROW = 2; // first row of actual data

// Business Name is the deduplication key (column index 1, 0-based → column B)
const DEDUP_COL_INDEX = 1;

// ─── Auth helper ──────────────────────────────────────────────────────────────

function buildAuth() {
  // Service Account path takes priority
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    return new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // OAuth2 fallback
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Google auth not configured. Set either GOOGLE_SERVICE_ACCOUNT_KEY_FILE ' +
      'or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.'
    );
  }

  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

function getClient() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set.');

  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Leads';
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  return { sheets, spreadsheetId, sheetName };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure the header row exists. Safe to call on every run — skips if headers
 * already match. Creates them if the sheet is empty.
 */
async function ensureHeaders() {
  const { sheets, spreadsheetId, sheetName } = getClient();
  const range = `${sheetName}!A${HEADER_ROW}:${colLetter(COLUMNS.length)}${HEADER_ROW}`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = (res.data.values ?? [])[0] ?? [];

  if (JSON.stringify(existing) === JSON.stringify(COLUMNS)) {
    logger.info('Sheet headers already correct — skipping write.');
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNS] },
  });

  logger.success('Sheet headers written.');
}

/**
 * Read the Business Name column from the sheet and return a lowercase Set
 * for fast deduplication lookups.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const { sheets, spreadsheetId, sheetName } = getClient();

  // Only fetch the Business Name column (column B)
  const colB = colLetter(DEDUP_COL_INDEX + 1);
  const range = `${sheetName}!${colB}${DATA_START_ROW}:${colB}`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values ?? [];

  const names = new Set(
    rows.flatMap((row) => (row[0] ? [row[0].trim().toLowerCase()] : []))
  );

  logger.info(`Found ${names.size} existing business name(s) in the sheet.`);
  return names;
}

/**
 * Append an array of new lead rows to the sheet.
 *
 * @param {string[][]} rows  Each inner array must match the COLUMNS layout.
 * @returns {Promise<number>} Number of rows appended.
 */
async function appendRows(rows) {
  if (rows.length === 0) {
    logger.info('No rows to append.');
    return 0;
  }

  const { sheets, spreadsheetId, sheetName } = getClient();
  const range = `${sheetName}!A:${colLetter(COLUMNS.length)}`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.success(`Appended ${rows.length} new row(s) to the sheet.`);
  return rows.length;
}

/**
 * Quick connectivity check — fetches spreadsheet metadata only.
 * Returns the spreadsheet title string on success.
 */
async function testConnection() {
  const { sheets, spreadsheetId } = getClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title',
  });
  return res.data.properties?.title ?? '(untitled)';
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Convert a 1-based column number to an A1-notation letter (e.g. 9 → "I"). */
function colLetter(n) {
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendRows, testConnection, COLUMNS };
