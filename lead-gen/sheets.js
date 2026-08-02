/**
 * sheets.js — Google Sheets read/write helpers
 *
 * Uses a service account for headless/cron access.
 *
 * Setup:
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project → enable Google Sheets API
 *   3. IAM & Admin → Service Accounts → create one → download JSON key
 *   4. Share your spreadsheet with the service account email (Editor role)
 *   5. Set GOOGLE_CREDENTIALS_PATH=./google-credentials.json in .env
 *      OR set GOOGLE_CREDENTIALS_JSON=<entire JSON as one line>
 */

const { google } = require('googleapis');

let _sheetsClient = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getClient() {
  if (_sheetsClient) return _sheetsClient;

  let credentials;

  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else {
    const path = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
    credentials = require(require('path').resolve(path));
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Read all existing business names from the sheet.
 * Returns a Set<string> of lowercased names for fast duplicate lookup.
 */
async function getExistingBusinessNames() {
  const sheets = await getClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.SHEET_TAB_NAME || 'Sheet1';

  // Column B = Business Name (index 1)
  const range = `${tab}!B:B`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];

  // Skip header row, lowercase all names for case-insensitive comparison
  return new Set(
    rows
      .slice(1)
      .map((row) => (row[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Append an array of lead rows to the sheet.
 * Each row must be in this column order:
 *   [Date Added, Business Name, Owner First, Owner Last, Phone, City, Website, Called, Notes]
 *
 * @param {string[][]} rows - array of row arrays
 */
async function appendLeads(rows) {
  if (!rows.length) return { updatedRows: 0 };

  const sheets = await getClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.SHEET_TAB_NAME || 'Sheet1';

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows,
    },
  });

  return {
    updatedRows: response.data.updates?.updatedRows || rows.length,
  };
}

// ── Verify connection ─────────────────────────────────────────────────────────

/**
 * Test that we can read the spreadsheet.
 * Returns the sheet title on success, throws on failure.
 */
async function verifyConnection() {
  const sheets = await getClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const response = await sheets.spreadsheets.get({ spreadsheetId });
  return response.data.properties.title;
}

module.exports = {
  getExistingBusinessNames,
  appendLeads,
  verifyConnection,
};
