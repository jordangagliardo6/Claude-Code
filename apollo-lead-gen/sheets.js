/**
 * Google Sheets helpers — authenticate, read existing businesses, append rows.
 * Uses a service account key file (see README for setup).
 */

const { google } = require("googleapis");
const path = require("path");

let _sheetsClient = null;

async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const keyFile = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  _sheetsClient = google.sheets({ version: "v4", auth });
  return _sheetsClient;
}

/**
 * Returns the set of business names already in the spreadsheet (column B).
 * Used for duplicate detection before appending new rows.
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || "Sheet1";

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Column B only — Business Name
    range: `${tab}!B:B`,
  });

  const rows = response.data.values || [];
  // Skip header row (row 1), normalize to lowercase for comparison
  return new Set(
    rows.slice(1).map((r) => (r[0] || "").trim().toLowerCase())
  );
}

/**
 * Appends an array of row arrays to the sheet.
 * Each inner array must match SHEET_COLUMNS order from config.js.
 */
async function appendRows(rows) {
  if (!rows.length) return;

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || "Sheet1";

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:I`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

/**
 * Writes the header row if the sheet is empty.
 * Safe to call on every run — only writes if no data exists yet.
 */
async function ensureHeaderRow(columns) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || "Sheet1";

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:I1`,
  });

  const existing = (response.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [columns] },
    });
    console.log("Header row written to sheet.");
  }
}

module.exports = { getExistingBusinessNames, appendRows, ensureHeaderRow };
