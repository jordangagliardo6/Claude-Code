// sheets.js — Google Sheets read/write via the Sheets API v4
//
// Auth: Service Account (recommended for automated scripts).
//   1. Create a service account in Google Cloud Console.
//   2. Download the JSON key and save as credentials.json in the project root.
//   3. Share your spreadsheet with the service account's email address (Editor).
//
// The spreadsheet ID comes from its URL:
//   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit

const { google } = require('googleapis');
const path = require('path');

// ── Column layout ─────────────────────────────────────────────────────────────
// Change column positions here if you add/remove/reorder columns.
// Columns are 0-indexed (A=0, B=1, ...).

const SHEET_NAME = 'Sheet1'; // Change to your sheet tab name (e.g. 'Leads')
const DATA_RANGE = `${SHEET_NAME}!A:I`;

const HEADER_ROW = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H (leave blank — fill manually)
  'Notes',            // I (leave blank — fill manually)
];

// Column index of Business Name — used for duplicate detection.
const BUSINESS_NAME_COL_INDEX = 1; // B (0-indexed)

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAuth() {
  const keyFile = process.env.GOOGLE_CREDENTIALS_PATH
    || path.join(__dirname, '..', 'credentials.json');

  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// ── Sheet Operations ──────────────────────────────────────────────────────────

// Returns the Set of all business names already in the sheet (lowercase trimmed).
// Used to skip duplicates before appending.
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!B:B`, // Business Name column only — faster than reading all columns
  });

  const rows = data.values || [];
  // rows[0] is the header ("Business Name") — skip it
  return new Set(
    rows.slice(1).map(row => (row[0] || '').trim().toLowerCase())
  );
}

// Creates the header row if the sheet is empty (first-time setup).
async function ensureHeaders() {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A1:I1`,
  });

  const firstRow = (data.values || [])[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    console.log('Sheet was empty — header row created.');
  }
}

// Appends an array of lead objects to the bottom of the sheet.
// Returns the number of rows written.
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = await getSheetsClient();
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — filled manually
    '', // Notes — filled manually
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: DATA_RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { getExistingBusinessNames, ensureHeaders, appendLeads };
