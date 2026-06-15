/**
 * sheets.js — Google Sheets API integration
 *
 * Handles reading existing business names (to prevent duplicates)
 * and appending new lead rows to the spreadsheet.
 *
 * Authentication: OAuth 2.0 using credentials.json + token.json.
 * Run `npm run setup` to generate token.json on the first use.
 *
 * Spreadsheet column layout (A–I):
 *   A: Date Added
 *   B: Business Name
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called     ← left blank, fill in manually
 *   I: Notes      ← left blank, fill in manually
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Paths to OAuth credential files (placed in the lead-generation/ folder)
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

// Scopes required: read + write spreadsheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Load the OAuth2 client using stored credentials and token.
 * Throws a descriptive error if either file is missing.
 */
function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials.json not found in lead-generation/. ' +
        'Download it from Google Cloud Console → APIs & Services → Credentials.'
    );
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      'token.json not found. Run `npm run setup` to authorize Google Sheets access.'
    );
  }

  const { client_secret, client_id, redirect_uris } = JSON.parse(
    fs.readFileSync(CREDENTIALS_PATH)
  ).installed || JSON.parse(fs.readFileSync(CREDENTIALS_PATH)).web;

  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));

  // Persist refreshed tokens automatically
  auth.on('tokens', (tokens) => {
    const current = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const updated = { ...current, ...tokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
  });

  return auth;
}

/**
 * Return the Sheets API client.
 */
function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all business names already in the spreadsheet (column B, skipping header).
 * Returns a Set<string> of lowercased names for fast duplicate checking.
 */
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `${sheetName}!B:B`,
  });

  const rows = resp.data.values || [];
  // rows[0] is the header ("Business Name"), skip it
  return new Set(
    rows
      .slice(1)
      .map((row) => (row[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Ensure the spreadsheet has the required header row.
 * If the sheet is empty, writes the header; otherwise leaves it alone.
 */
async function ensureHeader() {
  const sheets = getSheetsClient();
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `${sheetName}!A1:I1`,
  });

  const firstRow = (resp.data.values || [])[0] || [];
  if (firstRow.length > 0) return; // header already exists

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'Date Added',
        'Business Name',
        'Owner First Name',
        'Owner Last Name',
        'Phone Number',
        'City',
        'Website',
        'Called',
        'Notes',
      ]],
    },
  });

  console.log('  Created spreadsheet header row.');
}

/**
 * Append an array of lead rows to the spreadsheet.
 *
 * @param {Array<Array>} rows - each inner array must match column order A–I
 */
async function appendRows(rows) {
  if (rows.length === 0) return;

  const sheets = getSheetsClient();
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Quick connectivity test — returns true if the spreadsheet is accessible.
 */
async function testConnection() {
  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    fields: 'spreadsheetId,properties/title',
  });
  return {
    ok: true,
    title: resp.data.properties?.title || '(untitled)',
  };
}

module.exports = {
  getExistingBusinessNames,
  ensureHeader,
  appendRows,
  testConnection,
};
