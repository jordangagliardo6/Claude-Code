/**
 * Google Sheets client
 * Uses a Service Account for unattended authentication — no tokens to refresh.
 *
 * Setup: see README.md → Step 2 (Create a Service Account)
 * Auth docs: https://cloud.google.com/docs/authentication/getting-started
 */

const { google } = require('googleapis');

// ─── Config (set via .env) ────────────────────────────────────────────────────

const SPREADSHEET_ID    = process.env.GOOGLE_SHEET_ID;
const SHEET_TAB         = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
const CREDENTIALS_FILE  = process.env.GOOGLE_CREDENTIALS_FILE || 'credentials.json';

// Column order must match the spreadsheet headers exactly:
// Date Added | Business Name | Owner First Name | Owner Last Name |
// Phone Number | City | Website | Called | Notes
const COLUMNS = [
  'dateAdded',
  'businessName',
  'firstName',
  'lastName',
  'phone',
  'city',
  'website',
  'called',
  'notes',
];

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Returns an authenticated Google API client using the service account key file.
 * The key file path is set by GOOGLE_CREDENTIALS_FILE in .env.
 */
async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

// ─── Sheet operations ─────────────────────────────────────────────────────────

/**
 * Read all Business Name values from column B (skipping the header row).
 * Returns a Set of lowercased names so dedup lookups are O(1).
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set in .env');

  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!B2:B`, // column B, skip header
  });

  const rows = res.data.values || [];
  return new Set(
    rows
      .map(row => (row[0] || '').toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Append an array of lead objects as new rows at the bottom of the sheet.
 * Each lead must have the keys listed in COLUMNS above.
 *
 * @param {Object[]} leads
 */
async function appendToSheet(leads) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set in .env');
  if (!leads.length) return;

  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Map each lead to an ordered array of cell values
  const rows = leads.map(lead => COLUMNS.map(col => lead[col] ?? ''));

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Verify connectivity by fetching spreadsheet metadata.
 * @returns {Promise<boolean>}
 */
async function testSheetsConnection() {
  if (!SPREADSHEET_ID) {
    console.error('  GOOGLE_SHEET_ID is not set in .env');
    return false;
  }

  try {
    const auth   = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    return true;
  } catch (err) {
    console.error('  Google Sheets error:', err.message);
    if (err.message.includes('invalid_grant') || err.message.includes('credentials')) {
      console.error('  → Check that credentials.json is valid and the file path is correct');
    }
    if (err.message.includes('404') || err.message.includes('not found')) {
      console.error('  → Check that GOOGLE_SHEET_ID is correct');
      console.error('  → Check that you shared the sheet with the service account email');
    }
    return false;
  }
}

module.exports = { getExistingBusinessNames, appendToSheet, testSheetsConnection };
