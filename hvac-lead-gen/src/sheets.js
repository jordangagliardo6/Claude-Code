/**
 * sheets.js — Google Sheets API client
 *
 * Handles reading existing leads (for duplicate checking) and
 * appending new rows to the spreadsheet.
 *
 * Column order (A–I):
 *   Date Added | Business Name | Owner First Name | Owner Last Name |
 *   Phone Number | City | Website | Called | Notes
 *
 * Authentication: Google service account JSON credentials file.
 * The service account email must have Editor access to the spreadsheet.
 *
 * To change the column order: update HEADERS and the row mapping in appendLeads().
 */

const { google } = require('googleapis');
const path = require('path');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

const HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // intentionally blank — filled manually
  'Notes',    // intentionally blank — filled manually
];

/**
 * Build and return an authenticated Google Sheets client.
 *
 * @returns {Promise<import('googleapis').sheets_v4.Sheets>}
 */
async function getSheetsClient() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, '..', 'credentials.json');

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Return a Set of existing business names (lowercase, trimmed) from
 * column B so we can skip duplicates before inserting.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B:B`,
  });

  const values = response.data.values || [];
  // Row 0 is the header — skip it
  const names = values.slice(1).map(row => (row[0] || '').toLowerCase().trim());
  return new Set(names);
}

/**
 * Write the header row if the sheet is currently empty.
 * Safe to call every run — it only writes if A1 is blank.
 *
 * @returns {Promise<void>}
 */
async function ensureHeaders() {
  const sheets = await getSheetsClient();

  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
  });

  const hasHeader = check.data.values && check.data.values.length > 0;
  if (!hasHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    console.log('[Sheets] Header row written.');
  }
}

/**
 * Append an array of lead objects to the spreadsheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @param {Array<object>} leads
 * @returns {Promise<number>} Number of rows inserted
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = await getSheetsClient();

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  // Map each lead to a row array matching HEADERS column order
  const rows = leads.map(lead => [
    today,                  // A: Date Added
    lead.businessName,      // B: Business Name
    lead.firstName,         // C: Owner First Name
    lead.lastName,          // D: Owner Last Name
    lead.phone,             // E: Phone Number
    lead.city,              // F: City
    lead.website || '',     // G: Website
    '',                     // H: Called  (blank — fill manually)
    '',                     // I: Notes   (blank — fill manually)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = {
  getExistingBusinessNames,
  ensureHeaders,
  appendLeads,
  HEADERS,
  SHEET_NAME,
};
