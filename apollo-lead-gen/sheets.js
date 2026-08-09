/**
 * sheets.js — Google Sheets client for reading existing leads and appending new ones.
 *
 * Authentication uses a Google service account (JSON key file).
 * The service account email must be granted Editor access to your spreadsheet.
 *
 * Spreadsheet column layout (A through I):
 *   A: Date Added
 *   B: Business Name   ← used for duplicate detection
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called          (left blank by this script)
 *   I: Notes           (left blank by this script)
 *
 * To change which tab the data lives on, set SHEET_TAB_NAME in your .env file.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ── Auth ───────────────────────────────────────────────────────────────────────

function buildAuthClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
    path.join(__dirname, 'credentials', 'service-account-key.json');

  const resolved = path.resolve(keyPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Google service account key not found at: ${resolved}\n` +
      `  1. Create a service account in Google Cloud Console.\n` +
      `  2. Download the JSON key and place it at the path above.\n` +
      `  3. Share your spreadsheet with the service account email (Editor role).\n` +
      `  See: https://cloud.google.com/iam/docs/creating-managing-service-accounts`
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetTab() {
  return process.env.SHEET_TAB_NAME || 'Sheet1';
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  return id;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Reads the Business Name column from the spreadsheet and returns a lowercase Set.
 * Used to detect duplicates before inserting new rows.
 *
 * @returns {Promise<Set<string>>} Lowercased existing business names.
 */
async function getExistingBusinessNames() {
  const sheets = google.sheets({ version: 'v4', auth: buildAuthClient() });
  const tab = getSheetTab();

  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `${tab}!B:B`, // Business Name is column B.
    });
  } catch (err) {
    if (err.code === 404) {
      throw new Error(
        'Spreadsheet not found (404). Verify GOOGLE_SPREADSHEET_ID and that the service account has access.'
      );
    }
    if (err.code === 403) {
      throw new Error(
        'Permission denied (403). Share the spreadsheet with the service account email as Editor.'
      );
    }
    throw err;
  }

  const rows = response.data.values || [];
  // Skip the header row (row 1) and normalize for case-insensitive comparison.
  return new Set(
    rows.slice(1).map(row => (row[0] || '').toLowerCase().trim()).filter(Boolean)
  );
}

/**
 * Appends an array of lead objects as new rows to the spreadsheet.
 *
 * @param {Array<{dateAdded, businessName, firstName, lastName, phone, city, website}>} leads
 */
async function appendLeads(leads) {
  if (!leads.length) return;

  const sheets = google.sheets({ version: 'v4', auth: buildAuthClient() });
  const tab = getSheetTab();

  // Map each lead to a row array matching the column order A–I.
  const rows = leads.map(lead => [
    lead.dateAdded,       // A: Date Added
    lead.businessName,    // B: Business Name
    lead.firstName,       // C: Owner First Name
    lead.lastName,        // D: Owner Last Name
    lead.phone,           // E: Phone Number
    lead.city,            // F: City
    lead.website,         // G: Website
    '',                   // H: Called   (user fills manually)
    '',                   // I: Notes    (user fills manually)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Ensures the header row exists. Call this once during first-time setup.
 * Safe to call on an already-initialized sheet — it will NOT overwrite existing data.
 */
async function ensureHeaderRow() {
  const sheets = google.sheets({ version: 'v4', auth: buildAuthClient() });
  const tab = getSheetTab();
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:I1`,
  });

  const existingHeader = (res.data.values || [])[0] || [];

  if (existingHeader.length > 0) {
    console.log(`  Header row already exists: [${existingHeader.join(', ')}]`);
    return;
  }

  const header = [
    'Date Added',
    'Business Name',
    'Owner First Name',
    'Owner Last Name',
    'Phone Number',
    'City',
    'Website',
    'Called',
    'Notes',
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [header] },
  });

  console.log('  Header row created.');
}

module.exports = { getExistingBusinessNames, appendLeads, ensureHeaderRow };
