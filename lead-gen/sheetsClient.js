/**
 * sheetsClient.js
 *
 * Reads and writes rows to the "HVAC Leads — SW Michigan (Master)" Google Sheet
 * using the Google Sheets API v4 with OAuth2 credentials.
 *
 * First-time setup:
 *   1. Go to https://console.cloud.google.com and create/select a project.
 *   2. Enable the Google Sheets API and Google Drive API.
 *   3. Create an OAuth 2.0 Client ID (Desktop app), download credentials.json.
 *   4. Place credentials.json in this directory.
 *   5. Run `npm run setup` once — it will open a browser, you log in, and
 *      a token.json is saved for all future runs (no browser needed again).
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Spreadsheet ID from the URL — update in .env if using a different sheet
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs';

// Tab name inside the spreadsheet (visible at the bottom in Google Sheets)
const SHEET_NAME = process.env.SHEET_NAME || 'Untitled';

// Column layout must match the spreadsheet header row:
// A=Date Added, B=Business Name, C=Owner First, D=Owner Last,
// E=Phone, F=City, G=Website, H=Called (blank), I=Notes (blank)
const DATA_RANGE = `${SHEET_NAME}!A:B`; // Only read A+B for dedup check
const APPEND_RANGE = `${SHEET_NAME}!A:I`;

/**
 * Returns an authenticated Google Sheets client.
 * Reads stored OAuth2 tokens from token.json (created by setup.js).
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials.json not found. Download OAuth2 Desktop credentials from ' +
      'https://console.cloud.google.com and save to lead-gen/credentials.json, ' +
      'then run: npm run setup'
    );
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      'token.json not found. Run `npm run setup` once to authorize Google Sheets access.'
    );
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);

  // Auto-refresh token when it expires
  oAuth2Client.on('tokens', (newTokens) => {
    const merged = { ...token, ...newTokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged));
  });

  return oAuth2Client;
}

/**
 * Returns a Set of lowercased existing business names for fast duplicate lookup.
 */
async function getExistingBusinessNames() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: DATA_RANGE,
  });

  const rows = resp.data.values ?? [];
  const names = new Set();

  // Skip the header row (row 0)
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][1] ?? '').trim().toLowerCase();
    if (name) names.add(name);
  }

  return names;
}

/**
 * Appends new lead rows to the spreadsheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @param {Array}  leads      Array of lead objects
 * @param {string} dateAdded  Date string in YYYY-MM-DD format
 */
async function appendLeads(leads, dateAdded) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Build the row arrays matching the column layout A–I
  const rows = leads.map((lead) => [
    dateAdded,             // A: Date Added
    lead.businessName,     // B: Business Name
    lead.firstName,        // C: Owner First Name
    lead.lastName,         // D: Owner Last Name
    lead.phone,            // E: Phone Number
    lead.city,             // F: City
    lead.website,          // G: Website
    '',                    // H: Called (user fills in)
    '',                    // I: Notes (user fills in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: APPEND_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`Appended ${rows.length} rows to ${SHEET_NAME} tab.`);
}

module.exports = { getExistingBusinessNames, appendLeads };
