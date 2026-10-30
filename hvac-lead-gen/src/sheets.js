'use strict';

/**
 * Google Sheets client — reads existing leads and appends new ones.
 *
 * Authentication: Service Account (recommended for scheduled scripts).
 * The service account JSON key file path comes from env GOOGLE_SERVICE_ACCOUNT_KEY_FILE.
 *
 * Sheet column layout (must match the spreadsheet):
 *   A: Date Added
 *   B: Business Name
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called       ← intentionally left blank
 *   I: Notes        ← intentionally left blank
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Column indices (0-based) — update here if you add or reorder columns.
const COL = {
  dateAdded:  0,  // A
  business:   1,  // B
  firstName:  2,  // C
  lastName:   3,  // D
  phone:      4,  // E
  city:       5,  // F
  website:    6,  // G
  called:     7,  // H (blank)
  notes:      8,  // I (blank)
};

const TOTAL_COLS = Object.keys(COL).length; // 9

// ─── Auth ─────────────────────────────────────────────────────────────────────

function buildAuth(keyFilePath) {
  const resolved = path.resolve(keyFilePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Service account key not found at: ${resolved}\n` +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE to the full path of your JSON key file.'
    );
  }
  return new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function buildSheets(auth) {
  return google.sheets({ version: 'v4', auth });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Verify we can connect and the header row looks right.
 * Returns true on success, throws on failure.
 */
async function testConnection(keyFilePath, spreadsheetId, tabName = 'Sheet1') {
  const auth = buildAuth(keyFilePath);
  const sheets = buildSheets(auth);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:I1`,
  });

  const headers = (res.data.values || [[]])[0] || [];
  console.log('  Google Sheets connected. Header row:', headers.join(' | '));
  return true;
}

/**
 * Read all business names currently in the sheet (column B).
 * Returns a Set of lowercase names for fast dedup lookups.
 */
async function readExistingBusinessNames(keyFilePath, spreadsheetId, tabName = 'Sheet1') {
  const auth = buildAuth(keyFilePath);
  const sheets = buildSheets(auth);

  // Read only column B (Business Name) to minimise data transfer
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!B:B`,
  });

  const rows = res.data.values || [];
  // rows[0] is the header "Business Name" — skip it
  const names = new Set();
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Append an array of lead objects to the sheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @param {string}  keyFilePath    - Path to service account JSON key
 * @param {string}  spreadsheetId  - Google Spreadsheet ID
 * @param {string}  tabName        - Worksheet tab name
 * @param {Array}   leads          - Array of lead objects to append
 * @returns {number} Number of rows appended
 */
async function appendLeads(keyFilePath, spreadsheetId, tabName = 'Sheet1', leads) {
  if (!leads || leads.length === 0) return 0;

  const auth = buildAuth(keyFilePath);
  const sheets = buildSheets(auth);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  // Build rows matching the column layout defined in COL above
  const rows = leads.map(lead => {
    const row = new Array(TOTAL_COLS).fill('');
    row[COL.dateAdded]  = today;
    row[COL.business]   = lead.businessName || '';
    row[COL.firstName]  = lead.firstName    || '';
    row[COL.lastName]   = lead.lastName     || '';
    row[COL.phone]      = lead.phone        || '';
    row[COL.city]       = lead.city         || '';
    row[COL.website]    = lead.website      || '';
    // called and notes intentionally blank
    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Ensure the header row exists. Safe to call on every run — it only writes
 * if A1 is empty.
 */
async function ensureHeaderRow(keyFilePath, spreadsheetId, tabName = 'Sheet1') {
  const auth = buildAuth(keyFilePath);
  const sheets = buildSheets(auth);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1`,
  });

  const a1 = (res.data.values || [[]])[0]?.[0] || '';
  if (a1) return; // Header already exists

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'Date Added',
        'Business Name',
        'Owner First Name',
        'Owner Last Name',
        'Phone Number',
        'City',
        'Website',
        'Called',
        'Notes',
      ]],
    },
  });

  console.log('  Created header row in spreadsheet.');
}

module.exports = { testConnection, readExistingBusinessNames, appendLeads, ensureHeaderRow };
