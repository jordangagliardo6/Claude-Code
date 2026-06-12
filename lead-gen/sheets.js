/**
 * sheets.js — Google Sheets integration via the googleapis SDK.
 *
 * Handles:
 *   - Authentication (service account JSON, key file, or OAuth2 file)
 *   - Creating the header row if the sheet is empty
 *   - Reading existing Business Names for duplicate detection
 *   - Appending new lead rows
 *
 * The spreadsheet ID and auth credentials come from environment variables.
 * See .env.example for all options.
 */

const { google } = require('googleapis');
const config = require('./config');

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Build a GoogleAuth client from whichever credential env var is set.
 * Checks three options in order:
 *   1. GOOGLE_SERVICE_ACCOUNT_JSON  — raw JSON string (best for cloud/CI)
 *   2. GOOGLE_SERVICE_ACCOUNT_FILE  — path to a service account key file
 *   3. GOOGLE_CREDENTIALS_FILE      — path to an OAuth2 credentials file
 */
async function getAuthClient() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({ credentials, scopes });
    return auth.getClient();
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
      scopes,
    });
    return auth.getClient();
  }

  if (process.env.GOOGLE_CREDENTIALS_FILE) {
    // OAuth2 flow — requires the token to have been previously authorized.
    // Run `node oauth-setup.js` (see README) to generate the token the first time.
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_CREDENTIALS_FILE,
      scopes,
    });
    return auth.getClient();
  }

  throw new Error(
    'No Google credentials found.\n' +
    'Set one of: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_FILE, ' +
    'or GOOGLE_CREDENTIALS_FILE in your .env file.'
  );
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

/**
 * If row 1 is empty, write the column headers defined in config.js.
 * Safe to call on every run — it's a no-op when headers already exist.
 */
async function ensureHeaderRow(sheets, spreadsheetId) {
  const range = `${config.sheetName}!A1:${columnLetter(config.columns.length)}1`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const firstRow = (response.data.values || [])[0] || [];

  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${config.sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.columns] },
    });
    console.log('Created header row in spreadsheet.');
  }
}

/**
 * Read column B (Business Name) and return a lowercase Set of existing names.
 * Used to skip duplicates before appending.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheetName}!B:B`, // column B = Business Name
  });

  const rows = response.data.values || [];
  return new Set(
    rows
      .slice(1) // skip header
      .map(row => (row[0] || '').toLowerCase().trim())
      .filter(Boolean)
  );
}

/** Convert a 1-based column index to a spreadsheet letter (1→A, 9→I, etc.). */
function columnLetter(n) {
  let letter = '';
  while (n > 0) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** Today's date as MM/DD/YYYY in Eastern Time. */
function todayET() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append new leads to the spreadsheet, skipping any business already present.
 *
 * @param {Array} leads  Array of normalized lead objects from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  }

  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  await ensureHeaderRow(sheets, spreadsheetId);
  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId);

  const today = todayET();
  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const nameKey = lead.businessName.toLowerCase().trim();

    if (!nameKey || existingNames.has(nameKey)) {
      skipped++;
      continue;
    }

    // Column order must match config.columns exactly:
    // Date Added | Business Name | First | Last | Phone | City | Website | Called | Notes
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called  — you fill this in
      '', // Notes   — you fill this in
    ]);

    existingNames.add(nameKey); // prevent within-batch dupes
  }

  if (newRows.length > 0) {
    const lastCol = columnLetter(config.columns.length);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${config.sheetName}!A:${lastCol}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

/**
 * Verify connectivity by fetching the spreadsheet title.
 * Called by test-connection.js before the first scheduled run.
 */
async function testConnection() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  }

  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return meta.data.properties?.title || 'Unknown Spreadsheet';
}

module.exports = { appendLeads, testConnection };
