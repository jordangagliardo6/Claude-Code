'use strict';

const path = require('path');
const { google } = require('googleapis');

// Column layout — update these labels if you ever change the column order
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
 * Build a Google Auth client from a service account JSON key file.
 * The key file path comes from GOOGLE_SERVICE_ACCOUNT_KEY_PATH in .env.
 *
 * @param {string} keyFilePath  Absolute or relative path to the service account JSON
 * @returns {google.auth.GoogleAuth}
 */
function createAuthClient(keyFilePath) {
  return new google.auth.GoogleAuth({
    keyFile: path.resolve(keyFilePath),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Return a Set of existing business names (lowercased) from column B of the sheet.
 * Used to skip duplicate inserts without re-querying on every lead.
 *
 * @param {google.auth.GoogleAuth} auth
 * @param {string} spreadsheetId
 * @param {string} sheetName       Tab name inside the spreadsheet
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames(auth, spreadsheetId, sheetName) {
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B2:B`, // column B, skip header row 1
  });

  const rows = res.data.values || [];
  return new Set(
    rows
      .map(r => r[0]?.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Append new lead rows to the spreadsheet.
 *
 * Each lead object must have:
 *   businessName, firstName, lastName, phoneNumber, city, website
 *
 * Blank values are inserted for the "Called" and "Notes" columns so you
 * can fill them in manually as you work through the list.
 *
 * @param {google.auth.GoogleAuth} auth
 * @param {string}  spreadsheetId
 * @param {Array}   leads          Array of lead objects
 * @param {string}  sheetName
 * @returns {Promise<number>}  Number of rows inserted
 */
async function appendLeads(auth, spreadsheetId, leads, sheetName) {
  const sheets = google.sheets({ version: 'v4', auth });

  const dateAdded = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const rows = leads.map(lead => [
    dateAdded,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phoneNumber,
    lead.city,
    lead.website || '',
    '', // Called — fill in manually
    '', // Notes  — fill in manually
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Write the header row to row 1 if the sheet is empty.
 * Safe to call on every run — does nothing if headers already exist.
 *
 * @param {google.auth.GoogleAuth} auth
 * @param {string} spreadsheetId
 * @param {string} sheetName
 */
async function ensureHeaderRow(auth, spreadsheetId, sheetName) {
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });
  }
}

module.exports = { createAuthClient, getExistingBusinessNames, appendLeads, ensureHeaderRow };
