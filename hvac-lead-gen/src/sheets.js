/**
 * sheets.js — Google Sheets read/write
 *
 * Reads existing business names to prevent duplicates, then appends new leads.
 * Uses a Google Service Account for auth — no OAuth browser flow needed for cron jobs.
 *
 * To change the column layout, update COLUMN_HEADERS and the appendLeads() row builder.
 */

const { google } = require('googleapis');
const fs = require('fs');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_TAB = process.env.SHEET_TAB_NAME || 'Sheet1';

// Column headers written to row 1 if the sheet is empty.
// Keep this in sync with the row array in appendLeads().
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

// ── Auth ──────────────────────────────────────────────────────────────────────

function loadCredentials() {
  const keyEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!keyEnv) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY is not set.\n' +
      'Set it to either:\n' +
      '  - A file path: /path/to/service-account-key.json\n' +
      '  - The JSON contents pasted as a single-line string'
    );
  }

  if (keyEnv.trim().startsWith('{')) {
    return JSON.parse(keyEnv);
  }

  // Treat as a file path
  if (!fs.existsSync(keyEnv)) {
    throw new Error(`Service account key file not found at: ${keyEnv}`);
  }
  return JSON.parse(fs.readFileSync(keyEnv, 'utf8'));
}

async function getAuth() {
  const credentials = loadCredentials();
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getClient() {
  const auth = await getAuth();
  return google.sheets({ version: 'v4', auth });
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns a Set of business names (lowercase) already in column B.
 * Used to prevent duplicate entries.
 */
async function getExistingBusinessNames() {
  const sheets = await getClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!B2:B10000`, // column B = Business Name; skip row 1 (header)
  });

  const rows = res.data.values || [];
  return new Set(
    rows
      .flat()
      .map(v => v?.toString().trim().toLowerCase())
      .filter(Boolean)
  );
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Creates the header row if the sheet is empty.
 * Called automatically by appendLeads() so you don't need to run it manually.
 */
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A1:I1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMN_HEADERS] },
    });
    console.log('  Header row written to spreadsheet.');
  }
}

/**
 * Appends an array of lead objects as new rows in the spreadsheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 */
async function appendLeads(leads) {
  const sheets = await getClient();
  await ensureHeaders(sheets);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  // Row order must match COLUMN_HEADERS
  const rows = leads.map(lead => [
    today,              // A: Date Added
    lead.businessName,  // B: Business Name
    lead.firstName,     // C: Owner First Name
    lead.lastName,      // D: Owner Last Name
    lead.phone,         // E: Phone Number
    lead.city,          // F: City
    lead.website,       // G: Website
    '',                 // H: Called (intentionally blank)
    '',                 // I: Notes (intentionally blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ── Health check ──────────────────────────────────────────────────────────────

/**
 * Verifies the service account can access the spreadsheet.
 * Returns the spreadsheet title on success.
 */
async function testConnection() {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'spreadsheetId,properties.title',
  });
  return res.data;
}

module.exports = { getExistingBusinessNames, appendLeads, testConnection };
