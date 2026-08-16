'use strict';

const { google } = require('googleapis');
const path = require('path');

// Google Sheets API scope — read + write
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column layout — if you add or reorder columns, update this list
// and the appendLeads() mapper below to match
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H — left blank
  'Notes',            // I — left blank
];

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

/**
 * Build and return an authenticated Google Sheets API client.
 * Uses a Service Account credentials JSON file (see SETUP.md).
 */
async function getSheetsClient() {
  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'
  );
  const auth = new google.auth.GoogleAuth({ keyFile: credPath, scopes: SCOPES });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Build the A1-notation range string, optionally prefixed with the sheet tab name.
 *
 * @param {string} range - e.g. "A:B" or "A2:I"
 * @returns {string}
 */
function makeRange(range) {
  const tab = (process.env.GOOGLE_SHEET_TAB || '').trim();
  return tab ? `${tab}!${range}` : range;
}

/**
 * Read all existing business names from column B (rows 2+).
 * Used to skip duplicates before appending new leads.
 *
 * @returns {Promise<Set<string>>} - Lowercase business names already in the sheet
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: makeRange('B2:B'), // column B, skip header row
  });

  const rows = res.data.values || [];
  // Build a lowercase set for case-insensitive dedup comparison
  return new Set(rows.map(row => (row[0] || '').trim().toLowerCase()));
}

/**
 * Append new lead rows to the spreadsheet.
 *
 * @param {object[]} leads - Array of lead objects shaped by workflow.js
 * @returns {Promise<number>} - Number of rows successfully appended
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const sheets = await getSheetsClient();

  // Map each lead object to an ordered array of cell values matching COLUMNS
  const values = leads.map(lead => [
    lead.dateAdded,        // A — Date Added
    lead.businessName,     // B — Business Name
    lead.ownerFirstName,   // C — Owner First Name
    lead.ownerLastName,    // D — Owner Last Name
    lead.phoneNumber,      // E — Phone Number
    lead.city,             // F — City
    lead.website,          // G — Website
    '',                    // H — Called (blank for manual fill)
    '',                    // I — Notes (blank for manual fill)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: makeRange('A:I'),
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return leads.length;
}

/**
 * Verify the spreadsheet is accessible and has the expected header row.
 * Called during setup-check to confirm credentials work before the first run.
 *
 * @returns {Promise<string[]>} - The header row values
 */
async function verifySpreadsheet() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: makeRange('A1:I1'),
  });

  return (res.data.values || [[]])[0];
}

module.exports = { getExistingBusinessNames, appendLeads, verifySpreadsheet, COLUMNS };
