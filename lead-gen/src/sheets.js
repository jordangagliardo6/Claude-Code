/**
 * Google Sheets client (service account auth).
 *
 * Sheet column layout (do not reorder without updating appendLeads()):
 *  A: Date Added       B: Business Name    C: Owner First Name
 *  D: Owner Last Name  E: Phone Number     F: City
 *  G: Website          H: Called (blank)   I: Notes (blank)
 *
 * To add columns, update HEADERS and the appendLeads() row builder.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const HEADERS = [
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

/**
 * Build an authenticated Google Sheets API client using a service account key file.
 * The service account JSON file must be shared read/write access to the target spreadsheet.
 *
 * @param {string} keyFilePath  Path to service-account.json
 * @returns {google.auth.GoogleAuth}
 */
function getAuthClient(keyFilePath) {
  const resolved = path.resolve(keyFilePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Service account key not found at: ${resolved}\n` +
      'See SETUP.md → "Step 2: Google Sheets" for setup instructions.'
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Ensure the header row exists in row 1. Safe to call on every run.
 *
 * @param {google.auth.GoogleAuth} auth
 * @param {string} sheetId
 * @param {string} tabName
 */
async function ensureHeaders(auth, sheetId, tabName) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:I1`,
  });

  const firstRow = (res.data.values || [])[0] || [];
  if (firstRow[0] === 'Date Added') return; // headers already present

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS] },
  });

  console.log('[Sheets] Header row written.');
}

/**
 * Read column B (Business Name) from the sheet and return a lowercase Set.
 * Used for O(1) duplicate lookups before inserting.
 *
 * @param {google.auth.GoogleAuth} auth
 * @param {string} sheetId
 * @param {string} tabName
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames(auth, sheetId, tabName) {
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!B:B`,
  });

  const rows = res.data.values || [];
  // Row 0 is the "Business Name" header — skip it
  return new Set(
    rows
      .slice(1)
      .map(row => (row[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Append new leads to the sheet as new rows.
 * Returns the number of rows actually written.
 *
 * @param {google.auth.GoogleAuth} auth
 * @param {string} sheetId
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @param {string} tabName
 * @returns {Promise<number>}
 */
async function appendLeads(auth, sheetId, leads, tabName) {
  if (leads.length === 0) return 0;

  const sheets = google.sheets({ version: 'v4', auth });
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const rows = leads.map(lead => [
    today,               // A: Date Added
    lead.businessName,   // B: Business Name
    lead.firstName,      // C: Owner First Name
    lead.lastName,       // D: Owner Last Name
    lead.phone,          // E: Phone Number
    lead.city,           // F: City
    lead.website || '',  // G: Website
    '',                  // H: Called (left blank for manual update)
    '',                  // I: Notes (left blank for manual update)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tabName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { getAuthClient, ensureHeaders, getExistingBusinessNames, appendLeads };
