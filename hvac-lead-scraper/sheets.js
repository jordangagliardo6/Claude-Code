/**
 * sheets.js — Google Sheets API client.
 *
 * Uses a service account JSON for auth (no browser OAuth needed for scheduled jobs).
 * Credentials file path is read from GOOGLE_CREDENTIALS_PATH env var.
 *
 * Google Sheets API docs: https://developers.google.com/sheets/api
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Build and return an authenticated Google Sheets client.
 * Reads the service account key from GOOGLE_CREDENTIALS_PATH.
 */
async function getSheetsClient() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, 'google-credentials.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      'See README.md → "Setting Up Google Credentials" for setup steps.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Read all business names already in the sheet (column B).
 * Returns a Set of lowercased names for fast duplicate checking.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,
  });

  const rows = response.data.values || [];
  // Row 1 is the header — skip it
  return new Set(
    rows.slice(1)
      .map(row => (row[0] || '').toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Append an array of lead objects to the spreadsheet.
 * Each lead must have: businessName, ownerFirstName, ownerLastName,
 *                      phone, city, website.
 * Returns the number of rows written.
 */
async function appendLeads(sheets, spreadsheetId, sheetName, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.ownerFirstName || '',
    lead.ownerLastName  || '',
    lead.phone          || '',
    lead.city           || '',
    lead.website        || '',
    '',  // Called — left blank
    '',  // Notes  — left blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!${config.sheetRange}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Verify the spreadsheet is accessible and has the expected header row.
 * Used by the --verify flag before the first scheduled run.
 */
async function verifySheet(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const header = (response.data.values || [[]])[0] || [];
  const expected = [
    'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
    'Phone Number', 'City', 'Website', 'Called', 'Notes',
  ];

  const mismatched = expected.filter((col, i) =>
    col.toLowerCase() !== (header[i] || '').toLowerCase()
  );

  return { header, expected, mismatched };
}

module.exports = { getSheetsClient, getExistingBusinessNames, appendLeads, verifySheet };
