/**
 * Google Sheets integration
 *
 * Reads existing leads (for dedup) and appends new ones.
 * Authenticates via a Google service account JSON key file.
 *
 * How to get credentials:
 *   1. Google Cloud Console → IAM & Admin → Service Accounts → Create
 *   2. Grant it no project roles (it only needs sheet access)
 *   3. Keys tab → Add Key → JSON → download as google-credentials.json
 *   4. Share your spreadsheet with the service account email (Editor role)
 */

const { google } = require('googleapis');
const fs = require('fs');

// ── Column order ──────────────────────────────────────────────────────────────
// Change the order here if you want to rearrange columns.
// The rest of the code references these by index position, not by name.
const HEADERS = [
  'Date Added',       // A
  'Business Name',    // B  ← used for dedup
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank — fill manually)
  'Notes',            // I  (left blank — fill manually)
];

// Column index (0-based) of the Business Name column — used for dedup reads
const BUSINESS_NAME_COL = 1; // B

/**
 * Build an authenticated Sheets client from the service account file.
 */
function getSheetsClient() {
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (!credPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_PATH is not set');
  if (!fs.existsSync(credPath)) {
    throw new Error(`Service account file not found: ${credPath}`);
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

function spreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set');
  return id;
}

function sheetTab() {
  return process.env.GOOGLE_SHEET_TAB || 'Leads';
}

/**
 * Ensure row 1 has the expected headers.
 * Safe to call every run — only writes if row 1 is empty.
 */
async function ensureHeaders() {
  const sheets = getSheetsClient();
  const id = spreadsheetId();
  const tab = sheetTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${tab}!A1:I1`,
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${tab}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    console.log('  Created header row in spreadsheet.');
  }
}

/**
 * Return a Set of lowercased business names already in the sheet.
 * Used to skip duplicates before appending.
 */
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const id = spreadsheetId();
  const tab = sheetTab();

  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${tab}!B:B`, // Business Name column only
    });
  } catch (err) {
    if (err.code === 404 || err.message?.includes('not found')) {
      throw new Error(
        `Spreadsheet not found — check GOOGLE_SPREADSHEET_ID: ${spreadsheetId()}`
      );
    }
    throw err;
  }

  const rows = res.data.values || [];
  // Skip the header row; normalise to lowercase for case-insensitive dedup
  return new Set(
    rows
      .slice(1)
      .map(row => (row[0] || '').trim().toLowerCase())
      .filter(name => name.length > 0)
  );
}

/**
 * Append an array of lead objects to the sheet.
 * Returns the number of rows actually written.
 *
 * @param {import('./apollo').Lead[]} leads
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = getSheetsClient();
  const id = spreadsheetId();
  const tab = sheetTab();

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const rows = leads.map(lead => [
    today,             // Date Added
    lead.businessName, // Business Name
    lead.firstName,    // Owner First Name
    lead.lastName,     // Owner Last Name
    lead.phone,        // Phone Number
    lead.city,         // City
    lead.website,      // Website
    '',                // Called     (intentionally blank)
    '',                // Notes      (intentionally blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendLeads, HEADERS };
