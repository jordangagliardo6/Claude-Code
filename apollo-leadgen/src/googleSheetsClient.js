/**
 * Thin client around the Google Sheets v4 API, authenticated via OAuth2
 * (client ID/secret + a long-lived refresh token — see README.md for how to
 * generate the refresh token once with `npm run get-google-token`).
 */

const { google } = require('googleapis');

function getAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Missing Google OAuth env vars. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID is not set. Add it to your .env file.');
  return id;
}

/**
 * Reads the "Business Name" column (column B) so the workflow can skip
 * businesses that are already in the sheet.
 */
async function getExistingBusinessNames(sheets, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${tabName}!B2:B`,
  });
  const rows = res.data.values || [];
  return new Set(rows.map((row) => row[0]).filter(Boolean));
}

/**
 * Appends new lead rows below the existing data. `rows` must already be in
 * the exact column order defined in config.js (sheet.columns).
 */
async function appendLeadRows(sheets, tabName, rows) {
  if (rows.length === 0) return;

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${tabName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

module.exports = { getSheetsClient, getExistingBusinessNames, appendLeadRows };
