// Google Sheets read/append helpers, authenticated via an OAuth2 token
// generated once by scripts/setup-google-auth.js.
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const config = require('../config');

const TOKEN_PATH = path.join(__dirname, '..', 'token.json');
const REDIRECT_URI = 'http://localhost:53682/oauth2callback';

const BUSINESS_NAME_COLUMN_INDEX = config.sheetColumns.indexOf('Business Name');
const BUSINESS_NAME_COLUMN_LETTER = String.fromCharCode(65 + BUSINESS_NAME_COLUMN_INDEX);

// Builds an authenticated Sheets API client from the saved OAuth token.
// Throws a clear error if setup hasn't been run yet.
function getClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SHEET_ID } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env');
  }
  if (!GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID not set in .env');
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('token.json not found — run `npm run setup-google-auth` first.');
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const oAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
  oAuth2Client.setCredentials(tokens);

  // googleapis refreshes the access token automatically; persist the new
  // one so future runs don't need to re-authenticate.
  oAuth2Client.on('tokens', (newTokens) => {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...tokens, ...newTokens }, null, 2));
  });

  return google.sheets({ version: 'v4', auth: oAuth2Client });
}

// Confirms the token can actually read the configured spreadsheet.
async function testConnection(sheetsClient) {
  await sheetsClient.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
}

// Returns the set of business names already in the sheet (lowercased,
// trimmed) so the workflow can skip duplicates before inserting.
async function getExistingBusinessNames(sheetsClient) {
  const range = `${config.sheetTabName}!${BUSINESS_NAME_COLUMN_LETTER}2:${BUSINESS_NAME_COLUMN_LETTER}`;
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range,
  });
  const rows = res.data.values || [];
  return rows.map((r) => (r[0] || '').trim().toLowerCase()).filter(Boolean);
}

// Appends new lead rows to the bottom of the sheet. `rows` must already be
// in config.sheetColumns order.
async function appendLeads(sheetsClient, rows) {
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${config.sheetTabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

module.exports = { getClient, testConnection, getExistingBusinessNames, appendLeads };
