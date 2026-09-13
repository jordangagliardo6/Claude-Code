const { google } = require('googleapis');
const config = require('./config');

/**
 * Authenticate with Google using a service account.
 * Expects GOOGLE_SERVICE_ACCOUNT_PATH to point to the JSON key file,
 * or GOOGLE_SERVICE_ACCOUNT_JSON to contain the JSON string directly.
 */
async function getAuthClient() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    credentials = require(process.env.GOOGLE_SERVICE_ACCOUNT_PATH);
  } else {
    throw new Error(
      'Google credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_PATH.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

/**
 * Read all values from a specific column in the spreadsheet.
 * Used to build the set of existing business names for dupe detection.
 */
async function getColumnValues(auth, spreadsheetId, sheetName, columnLetter) {
  const sheets = google.sheets({ version: 'v4', auth });
  const range = `${sheetName}!${columnLetter}:${columnLetter}`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  // Skip header row, flatten, normalize
  return rows
    .slice(1)
    .map((r) => (r[0] || '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Append an array of row arrays to the spreadsheet.
 * Each inner array must match the column order in config.SHEET_COLUMNS.
 */
async function appendRows(auth, spreadsheetId, sheetName, rows) {
  if (!rows.length) return;
  const sheets = google.sheets({ version: 'v4', auth });
  const range = `${sheetName}!A:I`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Ensure the target sheet has the correct header row.
 * If the sheet is empty, writes the header. If non-empty, validates it.
 */
async function ensureHeaders(auth, spreadsheetId, sheetName) {
  const sheets = google.sheets({ version: 'v4', auth });
  const range = `${sheetName}!A1:I1`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = (res.data.values || [])[0] || [];

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [config.SHEET_COLUMNS] },
    });
  }
}

/**
 * High-level helper: filter out rows whose business name already exists in
 * the sheet, then append the remaining new rows.
 * Returns the count of rows actually written.
 */
async function appendNewLeads(spreadsheetId, sheetName, newRows) {
  const auth = await getAuthClient();

  await ensureHeaders(auth, spreadsheetId, sheetName);

  // Column B = "Business Name" (letter B)
  const existing = await getColumnValues(auth, spreadsheetId, sheetName, 'B');
  const existingSet = new Set(existing);

  const toWrite = newRows.filter((row) => {
    const name = (row[config.BUSINESS_NAME_COL_INDEX] || '').trim().toLowerCase();
    return name && !existingSet.has(name);
  });

  await appendRows(auth, spreadsheetId, sheetName, toWrite);
  return toWrite.length;
}

module.exports = {
  getAuthClient,
  appendNewLeads,
  ensureHeaders,
};
