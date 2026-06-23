// ---------------------------------------------------------------------------
// Google Sheets client: reads existing Business Name values for the
// duplicate check, and appends new lead rows.
//
// Auth uses an OAuth2 "Desktop app" client + a long-lived refresh token
// generated once via `npm run google-auth` (scripts/googleOAuthSetup.js).
// ---------------------------------------------------------------------------

const { google } = require('googleapis');
const config = require('../config');

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Google OAuth credentials missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ' +
        'and GOOGLE_REFRESH_TOKEN in .env (run `npm run google-auth` to generate the refresh token).'
    );
  }

  const oAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

function sheetsApi() {
  return google.sheets({ version: 'v4', auth: getOAuthClient() });
}

/**
 * Verifies we can reach the configured spreadsheet/tab. Throws with a
 * descriptive message on failure. Used by scripts/testConnections.js and
 * safe to call before every scheduled run too.
 */
async function verifyAccess() {
  if (!config.spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env');
  }
  const sheets = sheetsApi();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.spreadsheetId });
  const tabNames = meta.data.sheets.map((s) => s.properties.title);
  if (!tabNames.includes(config.sheetTabName)) {
    throw new Error(
      `Tab "${config.sheetTabName}" not found in spreadsheet "${meta.data.properties.title}". ` +
        `Available tabs: ${tabNames.join(', ')}`
    );
  }
  return { spreadsheetTitle: meta.data.properties.title, tabNames };
}

/**
 * Returns a Set of lowercased, trimmed business names already in the sheet,
 * used to skip duplicates before appending new leads.
 */
async function getExistingBusinessNames() {
  const sheets = sheetsApi();
  const columnLetter = String.fromCharCode(65 + config.businessNameColumnIndex); // 0 -> A, 1 -> B, ...
  const range = `${config.sheetTabName}!${columnLetter}2:${columnLetter}`; // skip header row

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });

  const values = result.data.values || [];
  return new Set(values.map((row) => (row[0] || '').trim().toLowerCase()).filter(Boolean));
}

/**
 * Appends lead rows after the last row of data in the configured tab.
 * `rows` must already be in config.columns order.
 */
async function appendLeads(rows) {
  if (rows.length === 0) return;

  const sheets = sheetsApi();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetTabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

module.exports = { verifyAccess, getExistingBusinessNames, appendLeads };
