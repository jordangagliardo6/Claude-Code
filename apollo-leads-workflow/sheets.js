/**
 * Google Sheets API wrapper for reading and appending leads.
 *
 * Authentication: service account JSON key file (recommended for automation).
 * Set GOOGLE_CREDENTIALS_PATH to the path of your service account JSON file.
 * Then share your spreadsheet with the service account's client_email address
 * and grant it Editor access.
 *
 * Alternatively, set GOOGLE_CREDENTIALS_JSON to the raw JSON string of the
 * service account key (useful for environment variable injection in CI/Docker).
 */

const { google } = require('googleapis');
const fs = require('fs');
const config = require('./config');

/**
 * Build and return an authenticated Google Sheets client.
 * Reads credentials from GOOGLE_CREDENTIALS_PATH or GOOGLE_CREDENTIALS_JSON.
 */
function getSheetsClient() {
  let credentials;

  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else if (process.env.GOOGLE_CREDENTIALS_PATH) {
    const raw = fs.readFileSync(process.env.GOOGLE_CREDENTIALS_PATH, 'utf8');
    credentials = JSON.parse(raw);
  } else {
    throw new Error(
      'Google credentials not configured. Set GOOGLE_CREDENTIALS_PATH or GOOGLE_CREDENTIALS_JSON.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all values in the Business Name column and return them as a lowercase Set
 * for fast duplicate checking.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetTab
 * @returns {Set<string>}  lowercased business names already in the sheet
 */
async function getExistingBusinessNames(spreadsheetId, sheetTab) {
  const sheets = getSheetsClient();

  // Column B is "Business Name" (index 1)
  const range = `${sheetTab}!B2:B`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });

  const rows = res.data.values || [];
  return new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
}

/**
 * Append rows to the sheet. Each row must be an array matching COLUMNS order.
 *
 * @param {string}    spreadsheetId
 * @param {string}    sheetTab
 * @param {string[][]} rows         - 2D array of values to append
 */
async function appendLeads(spreadsheetId, sheetTab, rows) {
  if (!rows.length) return;

  const sheets = getSheetsClient();
  const range = `${sheetTab}!A:I`; // 9 columns: A through I

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Verify Sheets API access by reading the header row.
 * Throws on auth failure or sheet-not-found; resolves on success.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetTab
 */
async function verifyAccess(spreadsheetId, sheetTab) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTab}!A1:I1`,
  });

  const headers = (res.data.values?.[0] || []).join(', ');
  console.log(`  Sheet header row: ${headers || '(empty — no headers found yet)'}`);
}

module.exports = { getExistingBusinessNames, appendLeads, verifyAccess };
