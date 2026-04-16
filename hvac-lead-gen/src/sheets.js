/**
 * sheets.js
 * Handles all Google Sheets (via Google Drive API) interactions.
 *
 * Authentication: Service Account JSON key file (recommended for server-side
 * automation) OR OAuth2 refresh token flow.  This module supports both.
 *
 * Required env vars:
 *   GOOGLE_SPREADSHEET_ID   – the ID from the sheet's URL
 *   GOOGLE_SHEET_NAME       – tab/sheet name inside the workbook (default: "Leads")
 *
 * Auth — choose ONE of the two approaches:
 *   Option A (Service Account — easiest for automation):
 *     GOOGLE_SERVICE_ACCOUNT_KEY_FILE  – path to your downloaded service account JSON
 *   Option B (OAuth2):
 *     GOOGLE_CLIENT_ID
 *     GOOGLE_CLIENT_SECRET
 *     GOOGLE_REFRESH_TOKEN
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Column layout — change header names or order here if needed
// ---------------------------------------------------------------------------

/**
 * COLUMNS defines the spreadsheet column structure.
 * The order here must match the order in the Google Sheet exactly.
 * "static" columns get a fixed value; "blank" columns are left empty for you.
 */
const COLUMNS = [
  { header: 'Date Added',        field: 'dateAdded' },
  { header: 'Business Name',     field: 'businessName' },
  { header: 'Owner First Name',  field: 'firstName' },
  { header: 'Owner Last Name',   field: 'lastName' },
  { header: 'Phone Number',      field: 'phone' },
  { header: 'City',              field: 'city' },
  { header: 'Website',           field: 'website' },
  { header: 'Called',            field: null },   // blank — you fill manually
  { header: 'Notes',             field: null },   // blank — you fill manually
];

// The column that holds the Business Name — used for duplicate detection.
const BUSINESS_NAME_COL_INDEX = COLUMNS.findIndex((c) => c.field === 'businessName');

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * getAuthClient — returns an authenticated Google API client.
 * Automatically detects whether to use Service Account or OAuth2.
 */
async function getAuthClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  if (keyFile) {
    // --- Option A: Service Account (recommended) ---
    const resolvedPath = path.resolve(keyFile);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Service account key file not found at: ${resolvedPath}\n` +
        'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE to the correct path.'
      );
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: resolvedPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth.getClient();
  }

  // --- Option B: OAuth2 refresh token ---
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google auth not configured.\n' +
      'Provide either GOOGLE_SERVICE_ACCOUNT_KEY_FILE (Service Account)\n' +
      'or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (OAuth2).'
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// ---------------------------------------------------------------------------
// Core sheet operations
// ---------------------------------------------------------------------------

/**
 * getSheetsClient — returns an authenticated Sheets API instance.
 */
async function getSheetsClient() {
  const auth = await getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * getSpreadsheetConfig — reads required env vars and validates them.
 */
function getSpreadsheetConfig() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Leads';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  }
  return { spreadsheetId, sheetName };
}

/**
 * ensureHeaderRow
 * Checks whether the first row of the sheet matches COLUMNS.
 * If the sheet is empty, writes the header row automatically.
 * If headers exist but don't match, logs a warning but continues.
 */
async function ensureHeaderRow(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:${colLetter(COLUMNS.length - 1)}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existingHeaders = res.data.values?.[0] ?? [];

  const expectedHeaders = COLUMNS.map((c) => c.header);

  if (existingHeaders.length === 0) {
    // Sheet is empty — write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [expectedHeaders] },
    });
    console.log('[Sheets] Header row created.');
    return;
  }

  const match = expectedHeaders.every((h, i) => existingHeaders[i] === h);
  if (!match) {
    console.warn(
      '[Sheets] Warning: existing headers do not match expected columns.\n' +
      `  Expected : ${expectedHeaders.join(' | ')}\n` +
      `  Found    : ${existingHeaders.join(' | ')}\n` +
      'Continuing — but column order may be wrong.'
    );
  }
}

/**
 * fetchExistingBusinessNames
 * Reads the Business Name column from the sheet and returns a lowercase Set.
 * Used for duplicate detection before inserting new rows.
 */
async function fetchExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  // Column letter for Business Name
  const col = colLetter(BUSINESS_NAME_COL_INDEX);
  const range = `${sheetName}!${col}2:${col}10000`; // skip header row

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values ?? [];
  return new Set(rows.map((r) => (r[0] ?? '').toLowerCase().trim()));
}

/**
 * appendLeads
 * Main export. Appends new leads to the Google Sheet, skipping duplicates.
 *
 * @param {import('./apollo').Lead[]} leads
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
async function appendLeads(leads) {
  const { spreadsheetId, sheetName } = getSpreadsheetConfig();
  const sheets = await getSheetsClient();

  // Ensure headers are in place
  await ensureHeaderRow(sheets, spreadsheetId, sheetName);

  // Load existing names for duplicate check
  const existing = await fetchExistingBusinessNames(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = (lead.businessName ?? '').toLowerCase().trim();

    if (existing.has(key)) {
      console.log(`[Sheets] Skipping duplicate: "${lead.businessName}"`);
      skipped++;
      continue;
    }

    // Build the row array following COLUMNS order
    const row = COLUMNS.map((col) => {
      if (col.field === null) return '';           // blank columns (Called, Notes)
      if (col.field === 'dateAdded') return today;
      return lead[col.field] ?? '';
    });

    newRows.push(row);
    existing.add(key); // prevent duplicates within this same batch
  }

  if (newRows.length === 0) {
    console.log('[Sheets] No new leads to insert (all were duplicates or empty).');
    return { inserted: 0, skipped };
  }

  // Append to end of sheet
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[Sheets] Inserted ${newRows.length} new lead(s). Skipped ${skipped} duplicate(s).`);
  return { inserted: newRows.length, skipped };
}

/**
 * testConnection
 * Lightweight check — reads the sheet title to confirm auth and access work.
 * Called by the test-connection script before the first scheduled run.
 *
 * @returns {Promise<string>}  spreadsheet title
 */
async function testConnection() {
  const { spreadsheetId, sheetName } = getSpreadsheetConfig();
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const title = res.data.properties?.title ?? '(untitled)';

  // Verify the target sheet tab exists
  const sheetTabs = res.data.sheets?.map((s) => s.properties?.title) ?? [];
  if (!sheetTabs.includes(sheetName)) {
    throw new Error(
      `Sheet tab "${sheetName}" not found in spreadsheet "${title}".\n` +
      `Available tabs: ${sheetTabs.join(', ')}\n` +
      `Set GOOGLE_SHEET_NAME to one of the tabs above.`
    );
  }

  return title;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * colLetter — converts a 0-based column index to an A1-notation letter.
 * Supports up to column Z (index 25). Extend if you add many columns.
 */
function colLetter(index) {
  return String.fromCharCode(65 + index);
}

module.exports = { appendLeads, testConnection, COLUMNS };
