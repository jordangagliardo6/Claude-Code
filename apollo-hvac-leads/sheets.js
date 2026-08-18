// ─── Google Sheets Integration ────────────────────────────────────────────────
// Uses the googleapis library with a Service Account JSON key file.
// The service account must be given Editor access to the target spreadsheet.

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let sheets = null; // initialized once, reused across calls

// ─── Auth & Init ──────────────────────────────────────────────────────────────
// Loads credentials from the JSON key file and returns an authenticated
// Google Sheets API client.
async function initSheets() {
  const credFile = path.resolve(
    process.env.GOOGLE_CREDENTIALS_FILE || 'credentials.json'
  );

  if (!fs.existsSync(credFile)) {
    throw new Error(
      `Google credentials file not found at "${credFile}". ` +
      'Download your service account key JSON from Google Cloud Console and ' +
      'place it at this path (or set GOOGLE_CREDENTIALS_FILE in .env).'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  sheets = google.sheets({ version: 'v4', auth: authClient });
  return sheets;
}

// ─── Header management ────────────────────────────────────────────────────────
// Writes column headers to row 1 only if the sheet is empty.
// Safe to call on every run — won't overwrite data.
async function ensureHeaders(spreadsheetId, sheetName, columns) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [columns] },
    });
    console.log('[Sheets] Header row created.');
  }
}

// ─── Duplicate detection ──────────────────────────────────────────────────────
// Reads the Business Name column and returns a lowercase Set for O(1) lookup.
async function getExistingBusinessNames(spreadsheetId, sheetName, columnIndex) {
  // Column index 1 (B) = Business Name. Convert to A1 letter.
  const colLetter = String.fromCharCode(65 + columnIndex); // 0=A, 1=B, ...

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${colLetter}:${colLetter}`,
  });

  const rows = res.data.values || [];
  // Skip header row (index 0)
  return new Set(rows.slice(1).map(r => (r[0] || '').toLowerCase().trim()));
}

// ─── Append leads ─────────────────────────────────────────────────────────────
// Appends new rows below all existing data. Rows must be arrays in column order.
async function appendLeads(spreadsheetId, sheetName, rows) {
  if (!rows.length) return 0;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─── Connectivity check ───────────────────────────────────────────────────────
// Reads the spreadsheet metadata to confirm auth and sheet ID are correct.
async function verifyConnection(spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties?.title || '(untitled)';
}

module.exports = {
  initSheets,
  ensureHeaders,
  getExistingBusinessNames,
  appendLeads,
  verifyConnection,
};
