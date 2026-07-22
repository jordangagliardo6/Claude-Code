/**
 * sheets.js — Google Sheets read/write helpers.
 *
 * Auth: OAuth2 with a saved token file (run `node auth.js` once to set up).
 * Credentials path: credentials/google-credentials.json
 * Token path:       credentials/token.json
 *
 * Required env vars:
 *   GOOGLE_SPREADSHEET_ID — the ID from your sheet URL
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'token.json');

// Google Sheets scope — read + write
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ── Auth ──────────────────────────────────────────────────────────────────────

function getOAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Google credentials not found at ${CREDENTIALS_PATH}.\n` +
      `Run: npm run auth    (or node auth.js) to complete OAuth setup.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  // Google issues credentials with either an "installed" or "web" key
  const creds = raw.installed || raw.web;
  const auth = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0]
  );

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      `Google token not found at ${TOKEN_PATH}.\n` +
      `Run: npm run auth    (or node auth.js) to authorize Google Sheets access.`
    );
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  auth.setCredentials(token);

  // Automatically persist refreshed tokens so the script never needs re-auth
  auth.on('tokens', newTokens => {
    const merged = { ...token, ...newTokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
  });

  return auth;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getOAuthClient() });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set in your .env file.');
  return id;
}

// ── Sheet Operations ──────────────────────────────────────────────────────────

/**
 * Ensure the header row exists in the sheet.
 * Creates it if the first cell is blank or contains a different value.
 */
async function ensureHeaderRow() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const range = `${config.sheetTab}!A1:I1`;

  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const firstRow = (data.values || [])[0] || [];

  if (firstRow[0] !== 'Date Added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [config.columns] },
    });
    console.log('  ✓ Header row written to sheet.');
  }
}

/**
 * Return a Set of existing business names (lowercased, trimmed) from column B.
 * Used to skip duplicates before writing.
 */
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Column B = Business Name; start from row 2 to skip the header
    range: `${config.sheetTab}!B2:B`,
  });

  const rows = data.values || [];
  return new Set(rows.flat().map(name => name.trim().toLowerCase()).filter(Boolean));
}

/**
 * Append an array of lead objects to the sheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @returns {number} Number of rows actually written
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Build row arrays matching the column order in config.columns
  const rows = leads.map(lead => [
    today,                  // Date Added
    lead.businessName,      // Business Name
    lead.firstName,         // Owner First Name
    lead.lastName,          // Owner Last Name
    lead.phone,             // Phone Number
    lead.city,              // City
    lead.website,           // Website
    '',                     // Called  (left blank — user fills in)
    '',                     // Notes   (left blank — user fills in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${config.sheetTab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { ensureHeaderRow, getExistingBusinessNames, appendLeads };
