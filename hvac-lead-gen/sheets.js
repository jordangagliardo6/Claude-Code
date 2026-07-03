/**
 * sheets.js
 * Reads from and appends to a Google Sheets spreadsheet.
 * Uses a Service Account for authentication — no browser OAuth required,
 * which makes it perfect for automated/scheduled jobs.
 *
 * Column layout (A–I):
 *   A: Date Added
 *   B: Business Name      ← used for duplicate detection
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called             (left blank — you fill in manually)
 *   I: Notes              (left blank — you fill in manually)
 */

'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Column positions (0-indexed, matching the layout above)
const COL = {
  DATE_ADDED     : 0,  // A
  BUSINESS_NAME  : 1,  // B
  FIRST_NAME     : 2,  // C
  LAST_NAME      : 3,  // D
  PHONE          : 4,  // E
  CITY           : 5,  // F
  WEBSITE        : 6,  // G
  CALLED         : 7,  // H  (blank)
  NOTES          : 8,  // I  (blank)
};

const HEADER_ROW = [
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

function getAuthClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './service-account.json';
  const resolvedPath = path.resolve(keyFile);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Google service account key file not found at: ${resolvedPath}\n` +
      'See SETUP INSTRUCTIONS in setup-test.js for how to create one.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the Set of business names already in the sheet (lowercased for
 * case-insensitive dedup comparison).
 */
async function getExistingBusinessNames() {
  const sheets       = getSheetsClient();
  const spreadsheetId = requireSpreadsheetId();
  const tab          = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
  const range        = `${tab}!B:B`; // Business Name column only

  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values ?? [];

  // rows[0] is the header row — skip it
  const names = new Set(
    rows.slice(1).map(row => (row[0] || '').trim().toLowerCase())
  );

  console.log(`[Sheets] Found ${names.size} existing business names in sheet`);
  return names;
}

/**
 * Ensures the header row exists in the sheet. Safe to call every run —
 * only writes headers if row 1 is empty.
 */
async function ensureHeaderRow() {
  const sheets        = getSheetsClient();
  const spreadsheetId = requireSpreadsheetId();
  const tab           = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
  const range         = `${tab}!A1:I1`;

  const check = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = check.data.values?.[0] ?? [];

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    console.log('[Sheets] Header row written');
  }
}

/**
 * Appends an array of lead objects to the sheet.
 * Each lead: { businessName, firstName, lastName, phone, city, website }
 * Returns the number of rows actually written.
 */
async function appendLeads(leads) {
  if (leads.length === 0) {
    console.log('[Sheets] Nothing to append');
    return 0;
  }

  const sheets        = getSheetsClient();
  const spreadsheetId = requireSpreadsheetId();
  const tab           = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
  const range         = `${tab}!A:I`;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone : 'America/New_York',
    year     : 'numeric',
    month    : '2-digit',
    day      : '2-digit',
  });

  const rows = leads.map(lead => {
    const row = new Array(9).fill('');
    row[COL.DATE_ADDED]    = today;
    row[COL.BUSINESS_NAME] = lead.businessName;
    row[COL.FIRST_NAME]    = lead.firstName;
    row[COL.LAST_NAME]     = lead.lastName;
    row[COL.PHONE]         = lead.phone;
    row[COL.CITY]          = lead.city;
    row[COL.WEBSITE]       = lead.website;
    row[COL.CALLED]        = '';  // you fill this in
    row[COL.NOTES]         = '';  // you fill this in
    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption  : 'USER_ENTERED',
    insertDataOption  : 'INSERT_ROWS',
    requestBody       : { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new leads`);
  return rows.length;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set in your .env file');
  return id;
}

module.exports = { getExistingBusinessNames, ensureHeaderRow, appendLeads };
