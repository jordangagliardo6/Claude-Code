/**
 * Google Sheets integration — reads existing leads and appends new rows.
 * Supports both service account (recommended) and OAuth2 refresh-token auth.
 */

const { google } = require('googleapis');

// Column layout (0-indexed A=0 … I=8)
const COLUMNS = {
  DATE_ADDED:      0, // A
  BUSINESS_NAME:   1, // B  ← dedup key
  OWNER_FIRST:     2, // C
  OWNER_LAST:      3, // D
  PHONE:           4, // E
  CITY:            5, // F
  WEBSITE:         6, // G
  CALLED:          7, // H  (left blank by automation)
  NOTES:           8, // I  (left blank by automation)
};

function buildAuth() {
  // Option A: service account key as JSON string in env var
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // Option B: OAuth2 with stored refresh token
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return oauth2;
  }

  throw new Error(
    'No Google auth credentials found. Set either GOOGLE_SERVICE_ACCOUNT_JSON ' +
    'or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN in your .env file.'
  );
}

/**
 * Returns a Set of lowercase-trimmed business names already in the sheet.
 * Used to skip duplicates before appending.
 */
async function getExistingBusinessNames() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not set in your .env file.');

  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    // Read only column B (business name) — skip row 1 header
    range: `${tab}!B2:B`,
  });

  const rows = res.data.values || [];
  const names = new Set();
  rows.forEach((row) => {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  });
  return names;
}

/**
 * Appends an array of row arrays to the sheet.
 * Each row must match the 9-column layout: [date, bizName, first, last, phone, city, site, called, notes]
 */
async function appendLeads(rows) {
  if (!rows.length) return;

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Ensures the spreadsheet has the correct header row.
 * Safe to call on every run — only writes if row 1 is blank.
 */
async function ensureHeader() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:I1`,
  });

  const existing = check.data.values?.[0] || [];
  if (existing.length > 0) return; // header already present

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
        'Phone Number', 'City', 'Website', 'Called', 'Notes',
      ]],
    },
  });

  console.log('[Sheets] Header row written.');
}

module.exports = { getExistingBusinessNames, appendLeads, ensureHeader, COLUMNS };
