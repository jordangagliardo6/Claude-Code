/**
 * Google Sheets client
 *
 * Handles reading existing leads (for duplicate checking) and appending new ones.
 *
 * Supports two auth methods:
 *   1. Service account JSON  (recommended for scheduled/automated tasks)
 *   2. OAuth2 credentials    (for personal Google accounts)
 *
 * Column layout (A–I):
 *   A  Date Added       B  Business Name    C  Owner First Name
 *   D  Owner Last Name  E  Phone Number     F  City
 *   G  Website          H  Called (blank)   I  Notes (blank)
 *
 * To rearrange columns: update the COLS constant below and the HEADERS array.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column indices (0-based). Update here if you add or rearrange columns.
const COLS = {
  DATE_ADDED:  0,  // A
  BUSINESS:    1,  // B
  FIRST_NAME:  2,  // C
  LAST_NAME:   3,  // D
  PHONE:       4,  // E
  CITY:        5,  // F
  WEBSITE:     6,  // G
  CALLED:      7,  // H — left blank by workflow
  NOTES:       8,  // I — left blank by workflow
};

const HEADERS = [
  'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
  'Phone Number', 'City', 'Website', 'Called', 'Notes',
];

// ─────────────────────────────────────────────────────────────────────────────

function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID is not set. Add it to your .env file.');
  return id;
}

function getTabName() {
  return process.env.SHEET_TAB_NAME || 'Leads';
}

/**
 * Build a Google auth client from the credentials file.
 * Supports service accounts (preferred) and OAuth2 installed-app tokens.
 */
function buildAuth() {
  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json'
  );

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials not found at: ${credPath}\n` +
        'Options:\n' +
        '  A) Service account: download JSON from Google Cloud Console → IAM & Admin → Service Accounts\n' +
        '  B) OAuth2: run `npm run setup-oauth` to authorize via browser\n' +
        '  Set GOOGLE_CREDENTIALS_PATH in .env if using a custom location.'
    );
  }

  const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  // ── Service account ────────────────────────────────────────────────────────
  if (creds.type === 'service_account') {
    return new google.auth.GoogleAuth({ credentials: creds, scopes: SCOPES });
  }

  // ── OAuth2 installed-app credentials ──────────────────────────────────────
  const appCreds = creds.installed || creds.web;
  if (appCreds) {
    const oauth2 = new google.auth.OAuth2(
      appCreds.client_id,
      appCreds.client_secret,
      appCreds.redirect_uris[0]
    );
    const tokenPath = path.resolve('./credentials/token.json');
    if (!fs.existsSync(tokenPath)) {
      throw new Error(
        `OAuth2 token not found at ${tokenPath}.\n` +
          'Run `npm run setup-oauth` to complete the one-time browser authorization.'
      );
    }
    oauth2.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));

    // Auto-refresh the token when it expires
    oauth2.on('tokens', (tokens) => {
      if (tokens.refresh_token || tokens.access_token) {
        const existing = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
      }
    });

    return oauth2;
  }

  throw new Error(
    'Unrecognized credentials format. Expected a service account or OAuth2 credentials JSON.'
  );
}

/**
 * Return a Google Sheets API client.
 */
function getSheetsClient() {
  const auth = buildAuth();
  return google.sheets({ version: 'v4', auth });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the header row exists in row 1.
 * Safe to call on every run — only writes if row 1 is empty.
 */
async function ensureHeaders() {
  const sheets = getSheetsClient();
  const tab = getTabName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${tab}!A1:I1`,
  });

  const firstRow = (res.data.values || [[]])[0] || [];
  if (!firstRow.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSpreadsheetId(),
      range: `${tab}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    console.log('[Sheets] Header row written.');
  }
}

/**
 * Read all business names already in column B (rows 2 onward).
 * Returns a lowercased Set for O(1) duplicate detection.
 */
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const tab = getTabName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${tab}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.flat().map((name) => name.toLowerCase().trim()));
}

/**
 * Append new lead rows to the spreadsheet.
 * Returns the number of rows actually written.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const sheets = getSheetsClient();
  const tab = getTabName();

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

  const rows = leads.map((lead) => {
    const row = new Array(HEADERS.length).fill('');
    row[COLS.DATE_ADDED] = today;
    row[COLS.BUSINESS]   = lead.businessName;
    row[COLS.FIRST_NAME] = lead.firstName;
    row[COLS.LAST_NAME]  = lead.lastName;
    row[COLS.PHONE]      = lead.phone;
    row[COLS.CITY]       = lead.city;
    row[COLS.WEBSITE]    = lead.website;
    // CALLED and NOTES are intentionally left blank
    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendLeads };
