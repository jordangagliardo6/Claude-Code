// ─── Google Sheets API ────────────────────────────────────────────────────────
// Reads and appends rows to the configured spreadsheet.
// Authentication uses a Service Account key (recommended for unattended runs).
// ──────────────────────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const path  = require('path');
const fs    = require('fs');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME     = process.env.GOOGLE_SHEET_NAME || 'Leads';

// Expected column layout (A–I)
const HEADER = [
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

function buildAuthClient() {
  // Option A: path to a service-account JSON file on disk
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile) {
    const resolved = path.resolve(keyFile);
    if (fs.existsSync(resolved)) {
      return new google.auth.GoogleAuth({
        keyFile: resolved,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
  }

  // Option B: entire service-account JSON inlined as an env-var string
  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(inlineJson),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  throw new Error(
    'No Google credentials found.\n' +
    'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE (path to JSON file) ' +
    'or GOOGLE_SERVICE_ACCOUNT_JSON (inline JSON string).'
  );
}

async function getSheetsClient() {
  const auth = buildAuthClient();
  return google.sheets({ version: 'v4', auth });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return a Set of lower-cased, trimmed business names already in column B.
 * Used for deduplication before inserting new rows.
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B:B`,
  });

  const values = res.data.values || [];
  const names  = new Set();

  // Row 0 is the header — skip it
  for (let i = 1; i < values.length; i++) {
    const cell = values[i]?.[0];
    if (cell) names.add(cell.toLowerCase().trim());
  }

  return names;
}

/**
 * Append an array of row arrays to the bottom of the sheet.
 * Each row must match the column order: Date, Business, First, Last, Phone, City, Website, Called, Notes.
 */
async function appendLeadsToSheet(rows) {
  if (!rows || rows.length === 0) return;

  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId:  SPREADSHEET_ID,
    range:          `${SHEET_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Write the header row to A1 if the sheet is empty.
 * Called automatically during testSheetsConnection().
 */
async function ensureHeaderRow() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:I1`,
  });

  const firstRow = res.data.values?.[0];
  if (!firstRow || firstRow[0] !== 'Date Added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID,
      range:            `${SHEET_NAME}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADER] },
    });
    console.log('  Header row written to sheet.');
  }
}

/**
 * Verify that credentials work and the spreadsheet is accessible.
 * Also ensures the header row exists.
 */
async function testSheetsConnection() {
  if (!SPREADSHEET_ID) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');
  }

  const sheets = await getSheetsClient();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'spreadsheetId,properties.title,sheets.properties.title',
  });

  const title        = meta.data.properties.title;
  const sheetTitles  = meta.data.sheets.map(s => s.properties.title);
  const sheetExists  = sheetTitles.includes(SHEET_NAME);

  console.log(`  Spreadsheet: "${title}"`);
  console.log(`  Target sheet: "${SHEET_NAME}" — ${sheetExists ? 'found' : 'NOT FOUND (will be created on first write)'}`);

  await ensureHeaderRow();
}

module.exports = { getExistingBusinessNames, appendLeadsToSheet, testSheetsConnection };
