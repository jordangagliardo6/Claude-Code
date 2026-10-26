/**
 * sheets.js — Google Sheets read/write via the googleapis SDK.
 *
 * Authentication: uses a service account JSON file (recommended for automation).
 * Set GOOGLE_CREDENTIALS_PATH to the path of your credentials.json, or
 * set GOOGLE_SERVICE_ACCOUNT_KEY to the entire JSON string (for hosted envs).
 */

const { google } = require('googleapis');
const { SHEET_COLUMNS, COLUMN_MAP } = require('./config');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── Auth ──────────────────────────────────────────────────────────────────────

function buildAuth() {
  // Option A: inline JSON string (useful for env-var-only deployments)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  }

  // Option B: path to a credentials.json file
  const keyFile = process.env.GOOGLE_CREDENTIALS_PATH ?? './credentials.json';
  return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
}

// ─── Header ────────────────────────────────────────────────────────────────────

async function ensureHeader(sheets, spreadsheetId, tabName) {
  const range = `${tabName}!A1:${colLetter(SHEET_COLUMNS.length - 1)}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const firstRow = res.data.values?.[0] ?? [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [SHEET_COLUMNS] },
    });
  }
}

// ─── Duplicate check ───────────────────────────────────────────────────────────

async function getExistingBusinessNames(sheets, spreadsheetId, tabName) {
  const nameColLetter = colLetter(COLUMN_MAP.businessName);
  const range = `${tabName}!${nameColLetter}2:${nameColLetter}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values ?? [];
  return new Set(rows.map(r => (r[0] ?? '').toLowerCase().trim()));
}

// ─── Main write ────────────────────────────────────────────────────────────────

/**
 * Append new leads to the spreadsheet, skipping duplicates.
 * Returns { added, skipped }.
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID environment variable is not set.');

  const tabName = process.env.SHEET_TAB_NAME ?? 'Sheet1';

  const auth  = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeader(sheets, spreadsheetId, tabName);

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId, tabName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const newLeads = leads.filter(
    l => !existingNames.has(l.businessName.toLowerCase().trim())
  );

  if (newLeads.length === 0) {
    return { added: 0, skipped: leads.length };
  }

  // Build rows aligned to SHEET_COLUMNS order
  const rows = newLeads.map(l => {
    const row = new Array(SHEET_COLUMNS.length).fill('');
    row[COLUMN_MAP.dateAdded]    = today;
    row[COLUMN_MAP.businessName] = l.businessName;
    row[COLUMN_MAP.firstName]    = l.firstName;
    row[COLUMN_MAP.lastName]     = l.lastName;
    row[COLUMN_MAP.phone]        = l.phone;
    row[COLUMN_MAP.city]         = l.city;
    row[COLUMN_MAP.website]      = l.website;
    // Called (index 7) and Notes (index 8) intentionally left blank
    return row;
  });

  const appendRange = `${tabName}!A:${colLetter(SHEET_COLUMNS.length - 1)}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: appendRange,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return { added: newLeads.length, skipped: leads.length - newLeads.length };
}

// ─── Connection test ───────────────────────────────────────────────────────────

/**
 * Read the first row of the spreadsheet to confirm auth and access.
 */
async function testConnection() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID environment variable is not set.');

  const tabName = process.env.SHEET_TAB_NAME ?? 'Sheet1';
  const auth    = buildAuth();
  const sheets  = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:A1`,
  });

  return { ok: true, firstCell: res.data.values?.[0]?.[0] ?? '(empty)' };
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

/** Convert a 0-based column index to a Sheets column letter (0→A, 25→Z, 26→AA). */
function colLetter(index) {
  let result = '';
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

module.exports = { appendLeads, testConnection };
