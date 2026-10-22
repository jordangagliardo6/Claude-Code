/**
 * Google Sheets module — read existing leads and append new ones.
 *
 * Authentication options (in priority order):
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY_FILE — path to a downloaded service account JSON key
 *   2. Application Default Credentials (ADC) — run `gcloud auth application-default login`
 *
 * The service account email must be shared on your Google Sheet with Editor access.
 */

const { google } = require('googleapis');
const path = require('path');

// ── Customization points ──────────────────────────────────────────────────────

// Sheet tab name. Default is "Sheet1" (Google's auto-created tab name).
// Change SHEET_TAB_NAME env var or edit here if you renamed your tab.
const SHEET_TAB = process.env.SHEET_TAB_NAME || 'Sheet1';

// Column headers — order must match what's in row 1 of your Google Sheet.
// Edit to add/remove columns; keep this array in sync with the sheet.
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank — you fill in manually)
  'Notes',            // I  (left blank — you fill in manually)
];

// ─────────────────────────────────────────────────────────────────────────────

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  return id;
}

async function getAuthClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  if (keyFile) {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyFile),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth.getClient();
  }

  // Fall back to Application Default Credentials (e.g. gcloud login)
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

async function getSheetsClient() {
  const auth = await getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Returns the column letter (A, B, …, Z) for a 1-based column index.
 */
function colLetter(index) {
  return String.fromCharCode(64 + index);
}

/**
 * Ensure the header row exists. Safe to call on every run — it's a no-op if
 * row 1 already contains data.
 */
async function ensureHeaderRow() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const check = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A1:A1`,
  });

  if ((check.data.values || []).length > 0) return; // Header already there

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNS] },
  });

  console.log('Header row created in Google Sheet.');
}

/**
 * Read all business names from column B (skipping header) and return them
 * as a lowercased Set for fast duplicate checking.
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  // Business Name is always column B (index 2 → letter B)
  const businessNameColLetter = colLetter(COLUMNS.indexOf('Business Name') + 1);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!${businessNameColLetter}2:${businessNameColLetter}10000`,
  });

  const names = new Set();
  for (const row of response.data.values || []) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }
  return names;
}

/**
 * Append an array of lead objects as new rows at the bottom of the sheet.
 *
 * @param {Object[]} leads  - Each with: businessName, ownerFirstName, ownerLastName,
 *                            phone, city, website
 */
async function appendLeads(leads) {
  await ensureHeaderRow();

  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.ownerFirstName,
    lead.ownerLastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — blank
    '', // Notes — blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB}!A:${colLetter(COLUMNS.length)}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Verify Google Sheets connectivity by reading the spreadsheet metadata.
 * Throws if authentication or sheet access fails.
 */
async function verifySheetConnection() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    return { ok: true, title: meta.data.properties?.title ?? 'Unknown' };
  } catch (err) {
    if (err.status === 403 || err.status === 401) {
      throw new Error(
        'Google Sheets access denied. Make sure the service account has Editor access on the sheet.'
      );
    }
    if (err.status === 404) {
      throw new Error('Google Sheet not found. Check your GOOGLE_SHEET_ID.');
    }
    throw new Error(`Google Sheets connection test failed: ${err.message}`);
  }
}

module.exports = { getExistingBusinessNames, appendLeads, verifySheetConnection };
