/**
 * sheets.js — Reads existing entries and appends new leads to Google Sheets.
 *
 * Auth: uses a Service Account JSON key (recommended) stored in
 * GOOGLE_SERVICE_ACCOUNT_KEY_FILE, or inline JSON in GOOGLE_SERVICE_ACCOUNT_JSON.
 *
 * The Service Account must have "Editor" access to the spreadsheet.
 * Share the sheet with the service account email (e.g. lead-bot@project.iam.gserviceaccount.com).
 */
const { google } = require('googleapis');
const fs = require('fs');
const config = require('./config');

let _sheets = null; // cached Sheets client

async function getSheetsClient() {
  if (_sheets) return _sheets;

  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Inline JSON (useful for environment-variable-only deployments)
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    // Path to a downloaded service account JSON key file
    const raw = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, 'utf8');
    credentials = JSON.parse(raw);
  } else {
    throw new Error(
      'Google credentials not configured. Set either:\n' +
      '  GOOGLE_SERVICE_ACCOUNT_JSON  (JSON string of the key file)\n' +
      '  GOOGLE_SERVICE_ACCOUNT_KEY_FILE  (path to the key file)'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/**
 * Returns a Set of business names already in the sheet (column B, rows 2+).
 * Used for duplicate detection before inserting.
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const range = `${config.SHEET_TAB_NAME}!B2:B`;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range,
  });

  const rows = resp.data.values || [];
  // Normalize to lowercase + trimmed for case-insensitive matching
  const names = new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
  console.log(`[Sheets] ${names.size} existing businesses loaded.`);
  return names;
}

/**
 * Appends an array of lead objects as new rows at the bottom of the sheet.
 *
 * Each lead must have: dateAdded, businessName, ownerFirstName,
 * ownerLastName, phone, city, website
 */
async function appendLeadsToSheet(leads) {
  if (!leads.length) {
    console.log('[Sheets] Nothing to append.');
    return;
  }

  const sheets = await getSheetsClient();

  // Map lead objects → row arrays in column order
  const rows = leads.map(l => [
    l.dateAdded,
    l.businessName,
    l.ownerFirstName,
    l.ownerLastName,
    l.phone,
    l.city,
    l.website,
    '', // Called — intentionally blank
    '', // Notes — intentionally blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_TAB_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new rows.`);
}

module.exports = { getExistingBusinessNames, appendLeadsToSheet };
