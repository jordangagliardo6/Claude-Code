// ---------------------------------------------------------------------------
// Reads/writes the lead-tracking Google Sheet via the Sheets API (the part
// of the Google Drive/Workspace API surface that actually understands rows
// and columns; the Drive API alone only sees the file as an opaque blob).
// Auth is OAuth2 "installed app" style: a one-time browser consent
// (scripts/google-auth.js) produces a refresh token that this client uses
// for every run after that — no user interaction needed on subsequent runs.
// ---------------------------------------------------------------------------
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in the environment.');
  }
  if (!GOOGLE_REFRESH_TOKEN) {
    throw new Error('GOOGLE_REFRESH_TOKEN is not set. Run `npm run auth:google` once to generate it.');
  }
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return client;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

// Ensures the header row exists and matches `columns` exactly. Creates it if
// the tab is empty; throws (loudly, for the caller to alert on) if the
// existing header row doesn't match — better to fail than silently misalign
// columns.
async function ensureHeaderRow(sheets, spreadsheetId, tabName, columns) {
  const range = `${tabName}!1:1`;
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existingHeader = (data.values && data.values[0]) || [];

  if (existingHeader.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [columns] },
    });
    return;
  }

  const matches = columns.every((col, i) => existingHeader[i] === col);
  if (!matches) {
    throw new Error(
      `Sheet header row does not match expected columns.\nExpected: ${columns.join(', ')}\nFound:    ${existingHeader.join(', ')}`
    );
  }
}

// Returns a Set of lowercase, trimmed business names already in the sheet,
// used to skip duplicates before inserting new leads.
async function getExistingBusinessNames(sheets, spreadsheetId, tabName, columns) {
  const businessNameColIndex = columns.indexOf('Business Name');
  const businessNameColLetter = String.fromCharCode(65 + businessNameColIndex); // A, B, C...
  const range = `${tabName}!${businessNameColLetter}2:${businessNameColLetter}`;
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = data.values || [];
  return new Set(rows.map((row) => (row[0] || '').trim().toLowerCase()).filter(Boolean));
}

// Appends lead rows (each already ordered to match `columns`) to the sheet.
async function appendLeads(sheets, spreadsheetId, tabName, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

module.exports = { getSheetsClient, ensureHeaderRow, getExistingBusinessNames, appendLeads };
