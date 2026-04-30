/**
 * googleSheets.js
 * Reads from and writes to a Google Sheets spreadsheet via the Sheets API v4.
 *
 * Authentication uses a Google service-account JSON key file.
 * The path defaults to credentials.json (project root) but can be overridden
 * via GOOGLE_CREDENTIALS_PATH in .env.
 *
 * Column layout (modify COLUMN_HEADERS to reorder or rename):
 *   A: Date Added
 *   B: Business Name   ← used for duplicate detection
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called          (left blank — you fill this in)
 *   I: Notes           (left blank — you fill this in)
 */

'use strict';

const { google } = require('googleapis');

// ── Configurable column structure ─────────────────────────────────────────────
// Change the order or names here to adjust the spreadsheet layout.
// IMPORTANT: keep Business Name in the position used by BUSINESS_NAME_COL below.
const COLUMN_HEADERS = [
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

// 0-based index of "Business Name" within COLUMN_HEADERS — used for deduplication
const BUSINESS_NAME_COL = 1;
// ─────────────────────────────────────────────────────────────────────────────

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set in .env');
  return id;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME ?? 'Leads';
}

async function buildSheetsClient() {
  const keyFile =
    process.env.GOOGLE_CREDENTIALS_PATH ?? 'credentials.json';

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Ensures the first row of the sheet contains the expected headers.
 * Writes them only if the sheet is completely empty.
 */
async function ensureHeaderRow(sheets) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();
  const lastCol = String.fromCharCode(65 + COLUMN_HEADERS.length - 1); // e.g. "I"

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:${lastCol}1`,
  });

  if (!data.values || data.values.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMN_HEADERS] },
    });
    console.log('  Header row written to spreadsheet.');
  }
}

/**
 * Returns a Set of lowercase, trimmed business names already in the sheet.
 * Used to skip duplicates before appending.
 */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();
  const col = String.fromCharCode(65 + BUSINESS_NAME_COL); // "B"

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${col}:${col}`,
  });

  const rows = data.values ?? [];
  // rows[0] is the header "Business Name" — skip it
  return new Set(
    rows
      .slice(1)
      .map((r) => r[0]?.toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Appends new leads to the spreadsheet, skipping duplicates.
 *
 * @param {Array} leads - Array of lead objects from apolloSearch.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  const sheets = await buildSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();
  const lastCol = String.fromCharCode(65 + COLUMN_HEADERS.length - 1);

  await ensureHeaderRow(sheets);

  const existingNames = await getExistingBusinessNames(sheets);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newLeads = leads.filter(
    (lead) => !existingNames.has(lead.businessName.toLowerCase().trim())
  );

  if (newLeads.length === 0) {
    return { added: 0, skipped: leads.length };
  }

  // Build row arrays to match COLUMN_HEADERS order
  const rows = newLeads.map((lead) => [
    today,                // Date Added
    lead.businessName,    // Business Name
    lead.firstName,       // Owner First Name
    lead.lastName,        // Owner Last Name
    lead.phone,           // Phone Number
    lead.city,            // City
    lead.website,         // Website
    '',                   // Called — blank for manual entry
    '',                   // Notes  — blank for manual entry
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:${lastCol}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  return { added: newLeads.length, skipped: leads.length - newLeads.length };
}

module.exports = { appendLeads };
