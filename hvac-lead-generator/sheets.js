/**
 * Google Sheets integration.
 *
 * Authentication: Google service account JSON key file.
 * Create a service account at https://console.cloud.google.com/iam-admin/serviceaccounts,
 * download the JSON key, and share the target spreadsheet with the service account email.
 *
 * Required API: Google Sheets API v4 (enable at https://console.cloud.google.com/apis)
 */

const { google } = require('googleapis');
const fs = require('fs');

// Column order that matches the spreadsheet header row
const COLUMNS = [
  'Date Added',      // A
  'Business Name',   // B
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H — left blank for manual use
  'Notes',           // I — left blank for manual use
];

/**
 * Build and return an authenticated Google Sheets API client.
 *
 * @param {string} keyFilePath  Path to the service account JSON file
 */
function buildSheetsClient(keyFilePath) {
  if (!fs.existsSync(keyFilePath)) {
    throw new Error(
      `Google credentials file not found at: ${keyFilePath}\n` +
      'Create a service account key at https://console.cloud.google.com/iam-admin/serviceaccounts'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensure the spreadsheet has a header row with the correct columns.
 * Safe to call on every run — skips writing if row 1 already looks correct.
 */
async function ensureHeaderRow(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:I1`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existingRow = response.data.values?.[0] ?? [];

  // Only write if the first column header is missing (empty sheet)
  if (existingRow[0] !== 'Date Added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('[sheets] Header row written.');
  }
}

/**
 * Read all existing Business Names from column B to detect duplicates.
 * Returns a Set<string> of lowercased business names for fast lookup.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!B2:B`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values ?? [];

  const names = new Set();
  for (const row of rows) {
    if (row[0]) names.add(row[0].trim().toLowerCase());
  }
  return names;
}

/**
 * Append new leads to the spreadsheet.
 * Skips any lead whose business name already exists (case-insensitive).
 *
 * @param {object}   sheets         Authenticated Sheets client
 * @param {string}   spreadsheetId  Target spreadsheet ID
 * @param {string}   sheetName      Target tab name
 * @param {object[]} leads          Array of normalized lead objects from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(sheets, spreadsheetId, sheetName, leads) {
  await ensureHeaderRow(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = (lead.businessName ?? '').trim().toLowerCase();
    if (!key || existing.has(key)) {
      skipped++;
      continue;
    }
    // Mark as seen to prevent duplicates within the same batch
    existing.add(key);

    newRows.push([
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

module.exports = { buildSheetsClient, appendLeads, COLUMNS };
