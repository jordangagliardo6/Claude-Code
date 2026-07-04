'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Column layout — change the order here to reorder columns in your sheet.
// The header names in COLUMNS must exactly match the first row of your spreadsheet.
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B  ← duplicate-check column
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank)
  'Notes',            // I  (left blank)
];

const BUSINESS_NAME_COL_INDEX = COLUMNS.indexOf('Business Name'); // 1 (0-based)

/**
 * Build and return an authenticated Google Sheets API client.
 * Uses a Service Account JSON key file (path set by GOOGLE_SERVICE_ACCOUNT_KEY_PATH).
 */
function getSheetsClient() {
  const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Google Service Account key not found at: ${keyPath}\n` +
      'Run "node setup.js" for instructions on creating it.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensure the spreadsheet has a header row. Creates one if the sheet is empty.
 */
async function ensureHeaders(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  const range = `${sheetName}!A1:${colLetter(COLUMNS.length - 1)}1`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = res.data.values?.[0] || [];

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('[sheets] Header row created.');
  }
}

/**
 * Read all existing Business Names from the sheet (column B).
 * Returns a Set<string> of lowercased names for fast lookup.
 */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  // Read only the Business Name column (B) — skip row 1 (header)
  const colB = colLetter(BUSINESS_NAME_COL_INDEX);
  const range = `${sheetName}!${colB}2:${colB}10000`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];

  return new Set(rows.flat().map(v => v.trim().toLowerCase()).filter(Boolean));
}

/**
 * Append an array of lead objects to the spreadsheet, skipping duplicates.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) return { added: 0, skipped: 0 };

  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  await ensureHeaders(sheets);

  const existingNames = await getExistingBusinessNames(sheets);
  const today = new Date().toLocaleDateString('en-US'); // MM/DD/YYYY

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const nameKey = (lead.businessName || '').trim().toLowerCase();
    if (!nameKey || existingNames.has(nameKey)) {
      skipped++;
      continue;
    }

    // Build row in the same order as COLUMNS
    newRows.push([
      today,              // Date Added
      lead.businessName,  // Business Name
      lead.firstName,     // Owner First Name
      lead.lastName,      // Owner Last Name
      lead.phone,         // Phone Number
      lead.city,          // City
      lead.website,       // Website
      '',                 // Called (blank)
      '',                 // Notes (blank)
    ]);

    existingNames.add(nameKey); // prevent intra-batch dupes
  }

  if (newRows.length > 0) {
    const range = `${sheetName}!A:I`;
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

/**
 * Quick connectivity check — just reads the spreadsheet metadata.
 */
async function testConnection() {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties?.title || '(untitled spreadsheet)';
}

// Convert 0-based column index to spreadsheet letter (0→A, 1→B, 25→Z, 26→AA)
function colLetter(n) {
  let letter = '';
  n++;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = { appendLeads, testConnection, getExistingBusinessNames, getSheetsClient };
