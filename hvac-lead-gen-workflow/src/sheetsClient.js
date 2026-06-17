// Talks to the Google Sheets API (using a Drive/Sheets OAuth client) to read existing
// rows for deduping and append new leads.
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const config = require('../config');

const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in the environment.');
  }

  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
  );

  // Refresh token can live in .env, or in token.json written by `npm run authorize`.
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken && fs.existsSync(TOKEN_PATH)) {
    refreshToken = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')).refresh_token;
  }
  if (!refreshToken) {
    throw new Error('No Google refresh token found. Run "npm run authorize" first.');
  }

  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getOAuthClient() });
}

// Converts a 1-based column index to a spreadsheet column letter (1 -> A, 27 -> AA).
function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Writes the configured header row, but only if the sheet is currently empty -
// this is what lets you safely change `config.columns` later without it clobbering data.
async function ensureHeaderRow(sheets, spreadsheetId) {
  const lastCol = columnLetter(config.columns.length);
  const range = `${config.sheetName}!A1:${lastCol}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const firstRow = res.data.values && res.data.values[0];
  if (!firstRow || firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [config.columns] },
    });
  }
}

async function getExistingBusinessNames(sheets, spreadsheetId) {
  const businessNameCol = columnLetter(config.columns.indexOf('Business Name') + 1);
  const range = `${config.sheetName}!${businessNameCol}2:${businessNameCol}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  return new Set(rows.map((r) => (r[0] || '').trim().toLowerCase()).filter(Boolean));
}

async function appendLeads(sheets, spreadsheetId, leads) {
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  const values = leads.map((lead) => [
    today,
    lead.businessName,
    lead.ownerFirstName,
    lead.ownerLastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called - left blank for manual tracking
    '', // Notes - left blank for manual tracking
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${config.sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

module.exports = { getSheetsClient, ensureHeaderRow, getExistingBusinessNames, appendLeads };
