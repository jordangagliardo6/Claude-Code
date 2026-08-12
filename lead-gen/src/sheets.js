'use strict';

/**
 * Google Sheets integration
 *
 * Uses a Google Service Account for auth (no browser / interactive OAuth required).
 * The service account must be granted Editor access to your spreadsheet.
 *
 * Setup: see SETUP.md → Step 2.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Column layout — change order here and the code adapts automatically
const COLUMNS = [
  'Date Added',      // A
  'Business Name',   // B
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H  (left blank by automation)
  'Notes',           // I  (left blank by automation)
];

const SHEET_NAME = 'Sheet1'; // Change if your tab has a different name
const DATA_RANGE = `${SHEET_NAME}!A:I`;

/** Build and return an authenticated Google Sheets client */
function getClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './credentials.json';
  const resolved = path.resolve(keyFile);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Google service account key file not found at: ${resolved}\n` +
      'See SETUP.md → Step 2 for how to create one.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all existing Business Name entries from the sheet.
 * Returns a Set of lowercased names for fast O(1) duplicate checks.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const sheets = getClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set in environment');

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!B:B`, // Business Name column only
  });

  const rows = res.data.values || [];
  // Skip header row (index 0), collect all business names
  const names = rows
    .slice(1)
    .map((r) => (r[0] || '').trim().toLowerCase())
    .filter(Boolean);

  console.log(`[Sheets] Found ${names.length} existing business(es) in the sheet`);
  return new Set(names);
}

/**
 * Ensure the header row exists; write it if the sheet is empty.
 */
async function ensureHeader() {
  const sheets = getClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:I1`,
  });

  const existingHeader = (res.data.values || [])[0] || [];
  if (existingHeader.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('[Sheets] Header row written');
  }
}

/**
 * Append an array of lead objects to the spreadsheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @param {Array} leads
 * @returns {Promise<number>}  Number of rows appended
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const sheets = getClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  const rows = leads.map((lead) => [
    today,              // Date Added
    lead.businessName,  // Business Name
    lead.firstName,     // Owner First Name
    lead.lastName,      // Owner Last Name
    lead.phone,         // Phone Number
    lead.city,          // City
    lead.website,       // Website
    '',                 // Called (blank)
    '',                 // Notes  (blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: DATA_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new lead(s)`);
  return rows.length;
}

module.exports = {
  getExistingBusinessNames,
  ensureHeader,
  appendLeads,
  COLUMNS,
};
