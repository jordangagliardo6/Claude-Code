/**
 * sheets.js — Google Sheets integration
 *
 * Reads existing business names to prevent duplicates, then appends new lead rows.
 *
 * Sheet columns (must match your spreadsheet exactly):
 *   A: Date Added | B: Business Name | C: Owner First Name | D: Owner Last Name
 *   E: Phone Number | F: City | G: Website | H: Called | I: Notes
 *
 * Authentication: uses either a Service Account key file OR OAuth2 stored tokens.
 * See .env.example for setup instructions.
 */

'use strict';
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ─── CONFIGURE THESE if your sheet is set up differently ─────────────────────
const SHEET_NAME = 'Sheet1';        // the tab name in your Google Sheet
const HEADER_ROWS = 1;              // number of header rows to skip when reading
const BUSINESS_NAME_COL = 'B';      // column letter that holds the business name
// ─────────────────────────────────────────────────────────────────────────────

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID environment variable is not set.');
  return id;
}

/**
 * Returns an authenticated Google auth client.
 * Tries Service Account first, falls back to OAuth2 token.
 */
function buildAuthClient() {
  // Option A: Service Account key file
  const saKeyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (saKeyPath) {
    const absPath = path.resolve(saKeyPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Service account key not found at: ${absPath}`);
    }
    return new google.auth.GoogleAuth({
      keyFile: absPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // Option B: OAuth2 with stored token
  const credPath = path.resolve(
    process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || path.join(__dirname, 'credentials.json')
  );
  const tokenPath = path.resolve(
    process.env.GOOGLE_OAUTH_TOKEN_PATH || path.join(__dirname, 'google-token.json')
  );

  if (!fs.existsSync(credPath)) {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or place credentials.json here.\n' +
      'See SETUP.md for instructions.'
    );
  }

  const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const cred = raw.installed || raw.web;
  const oAuth2 = new google.auth.OAuth2(
    cred.client_id,
    cred.client_secret,
    cred.redirect_uris[0]
  );

  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      'OAuth token not found. Run: node auth.js\n' +
      'to complete the one-time browser authorization flow.'
    );
  }

  oAuth2.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));
  return oAuth2;
}

async function getSheetsClient() {
  const auth = buildAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Returns a Set of lowercase business names already in column B.
 * Used for duplicate detection before appending.
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const range = `${SHEET_NAME}!${BUSINESS_NAME_COL}:${BUSINESS_NAME_COL}`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];

  // Skip header rows and normalize for case-insensitive comparison
  return new Set(
    rows.slice(HEADER_ROWS).map((row) => (row[0] || '').toLowerCase().trim())
  );
}

/**
 * Appends rows to the sheet. Each row must be an array matching columns A–I.
 * @param {Array[]} rows - Array of row arrays
 */
async function appendLeads(rows) {
  if (!rows || rows.length === 0) return;

  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const range = `${SHEET_NAME}!A:I`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Verifies the Google Sheets connection and logs sheet info.
 * Returns true if successful.
 */
async function testSheetsConnection() {
  try {
    const spreadsheetId = getSpreadsheetId();
    const sheets = await getSheetsClient();

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const title = meta.data.properties?.title || 'Unknown';
    console.log(`  Google Sheets: ✅ Connected to "${title}"`);
    console.log(`  Spreadsheet ID: ${spreadsheetId}`);

    const existing = await getExistingBusinessNames();
    console.log(`  Existing leads in sheet: ${existing.size}`);

    return true;
  } catch (err) {
    console.log(`  Google Sheets: ❌ ${err.message}`);
    return false;
  }
}

module.exports = { getExistingBusinessNames, appendLeads, testSheetsConnection };
