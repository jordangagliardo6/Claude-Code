/**
 * sheets.js — Google Sheets read/write integration.
 *
 * Uses a Service Account JSON file (GOOGLE_SERVICE_ACCOUNT_KEY_FILE env var
 * pointing to the downloaded credentials JSON) to authenticate without an
 * interactive OAuth flow — perfect for scheduled automation.
 *
 * The target spreadsheet must be shared with the service account email address
 * (shown in the credentials file under "client_email") as an Editor.
 */

const { google } = require('googleapis');
const config = require('./config');

/**
 * Returns an authenticated Google Sheets API client.
 */
async function getSheetsClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile)
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE environment variable is not set.'
    );

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Reads all values from the sheet and returns a Set of existing business
 * names (lowercased) for fast duplicate detection.
 *
 * @param {object} sheets  Authenticated Sheets API client
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const colLetter = colIndexToLetter(config.BUSINESS_NAME_COL);
  const range = `${sheetName}!${colLetter}:${colLetter}`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values ?? [];

  const names = new Set();
  // Skip the header row.
  for (let i = config.HEADER_ROW; i < rows.length; i++) {
    const name = (rows[i]?.[0] ?? '').toLowerCase().trim();
    if (name) names.add(name);
  }
  return names;
}

/**
 * Ensures the header row exists. Safe to call on every run — it checks first.
 */
async function ensureHeader(sheets) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const firstCell = `${sheetName}!A1`;
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: firstCell,
  });

  const existingHeader = check.data.values?.[0]?.[0] ?? '';
  if (existingHeader === config.SHEET_COLUMNS[0]) {
    // Header already in place — nothing to do.
    return;
  }

  // Write the header row.
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [config.SHEET_COLUMNS] },
  });
  console.log('[sheets] Header row written.');
}

/**
 * Appends an array of lead objects as new rows in the spreadsheet.
 * Skips any lead whose business name already appears in `existingNames`.
 *
 * @param {object} sheets          Authenticated Sheets API client
 * @param {Array}  leads           Lead objects from apollo.fetchLeads()
 * @param {Set}    existingNames   Lowercased business names already in sheet
 * @returns {Promise<number>}      Count of rows actually appended
 */
async function appendLeads(sheets, leads, existingNames) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const newRows = [];

  for (const lead of leads) {
    const key = (lead.businessName ?? '').toLowerCase().trim();
    if (!key || existingNames.has(key)) {
      console.log(`[sheets] Skipping duplicate: ${lead.businessName}`);
      continue;
    }

    newRows.push(buildRow(lead, today));
    existingNames.add(key); // prevent intra-batch duplicates
  }

  if (newRows.length === 0) {
    console.log('[sheets] No new rows to append.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[sheets] Appended ${newRows.length} row(s).`);
  return newRows.length;
}

/**
 * Builds a single sheet row array from a lead object.
 * Column order must match config.SHEET_COLUMNS exactly.
 *
 * SHEET_COLUMNS = [
 *   'Date Added',      ← today's date
 *   'Business Name',
 *   'Owner First Name',
 *   'Owner Last Name',
 *   'Phone Number',
 *   'City',
 *   'Website',
 *   'Called',          ← blank
 *   'Notes',           ← blank
 * ]
 */
function buildRow(lead, dateStr) {
  return [
    dateStr,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank for manual use
    '', // Notes  — left blank for manual use
  ];
}

/**
 * Converts a 0-based column index to a spreadsheet letter (0→A, 1→B, …).
 */
function colIndexToLetter(index) {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

module.exports = { getSheetsClient, getExistingBusinessNames, ensureHeader, appendLeads };
