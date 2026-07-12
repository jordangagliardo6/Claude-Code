'use strict';

const { google } = require('googleapis');
const config     = require('./config');

// Build an authenticated Google Sheets client from a service account key file.
// The key file path comes from GOOGLE_SERVICE_ACCOUNT_KEY_FILE (default: credentials.json).
async function getSheetsClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'credentials.json';

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Read all values from column B (Business Name) and return them as a lowercase Set.
// Used for deduplication before inserting new rows.
async function getExistingBusinessNames(spreadsheetId) {
  const sheets = await getSheetsClient();
  // Start from row 2 to skip the header
  const range = `${config.SHEET_TAB_NAME}!B2:B`;

  const res  = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];

  return new Set(
    rows.flat()
      .map(name => name.trim().toLowerCase())
      .filter(Boolean)
  );
}

// If row 1 of the sheet is empty, write the standard header row.
// Safe to call on every run — it's a no-op when headers already exist.
async function ensureHeaders(spreadsheetId) {
  const sheets = await getSheetsClient();
  const range  = `${config.SHEET_TAB_NAME}!A1:I1`;

  const res            = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existingHeader = (res.data.values || [])[0] || [];

  if (existingHeader.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [config.SHEET_HEADERS] },
    });
    console.log('Header row created in Google Sheet');
  }
}

// Append an array of lead objects to the sheet as new rows.
// Returns the number of rows written.
async function appendLeads(spreadsheetId, leads) {
  if (leads.length === 0) return 0;

  const sheets = await getSheetsClient();

  // Build rows in the same column order as SHEET_HEADERS (A–I)
  const rows = leads.map(lead => [
    lead.dateAdded,    // A — Date Added
    lead.businessName, // B — Business Name  (duplicate-check key)
    lead.firstName,    // C — Owner First Name
    lead.lastName,     // D — Owner Last Name
    lead.phone,        // E — Phone Number
    lead.city,         // F — City
    lead.website,      // G — Website
    '',                // H — Called  (blank — user fills in)
    '',                // I — Notes   (blank — user fills in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:           `${config.SHEET_TAB_NAME}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody:     { values: rows },
  });

  return rows.length;
}

module.exports = { getSheetsClient, getExistingBusinessNames, ensureHeaders, appendLeads };
