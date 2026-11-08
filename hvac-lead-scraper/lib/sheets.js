/**
 * Google Sheets API wrapper.
 *
 * Authentication uses a service account JSON key file.
 * To change the column layout, update HEADERS and the row builder in appendLeads().
 *
 * Setup:
 *   1. Create a Google Cloud project and enable the Google Sheets API.
 *   2. Create a Service Account, download its JSON key.
 *   3. Save the key as ./credentials/service-account.json
 *      (or set GOOGLE_CREDENTIALS_PATH in .env).
 *   4. Share your Google Sheet with the service account email (Editor access).
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column headers — to reorder or add columns, change this array AND
// update the row builder array in appendLeads() to match the new order.
const HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank for manual use
  'Notes',    // left blank for manual use
];

function getAuth() {
  const credPath =
    process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, '..', 'credentials', 'service-account.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      'Set GOOGLE_CREDENTIALS_PATH in .env or place your service-account.json there.\n' +
      'See .env.example for setup instructions.'
    );
  }

  const raw = fs.readFileSync(credPath, 'utf8');
  const creds = JSON.parse(raw);

  if (creds.type !== 'service_account') {
    throw new Error(
      'Only service account credentials are supported. ' +
      'Download a service account JSON key from Google Cloud Console.'
    );
  }

  return new google.auth.GoogleAuth({ keyFile: credPath, scopes: SCOPES });
}

/**
 * Returns a Set of lowercase business names already in the sheet.
 * Used to skip duplicates before inserting.
 */
async function getExistingBusinessNames(spreadsheetId, sheetName = 'Leads') {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Column B = Business Name (index 1 in HEADERS)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,
  });

  const rows = res.data.values || [];
  // Row 0 is the header — skip it
  return new Set(rows.slice(1).map((r) => (r[0] || '').trim().toLowerCase()));
}

/**
 * Appends new lead rows to the sheet.
 * @param {string} spreadsheetId
 * @param {Array} leads - Array of lead objects from apollo.js
 * @param {string} sheetName
 * @returns {Promise<number>} Number of rows appended
 */
async function appendLeads(spreadsheetId, leads, sheetName = 'Leads') {
  if (leads.length === 0) return 0;

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Row builder — column order must match HEADERS above.
  // To add a new column: add it to HEADERS and add the value here at the same index.
  const rows = leads.map((lead) => [
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
 * Writes the header row if the sheet is empty.
 * Safe to call on every run — it only writes if row 1 is blank.
 */
async function ensureHeaderRow(spreadsheetId, sheetName = 'Leads') {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const firstRow = (res.data.values || [])[0] || [];

  if (firstRow.length === 0 || firstRow[0] !== 'Date Added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });
    console.log('Header row created in Google Sheet.');
  }
}

module.exports = { getExistingBusinessNames, appendLeads, ensureHeaderRow };
