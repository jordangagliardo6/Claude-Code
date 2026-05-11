/**
 * Google Sheets client for reading existing leads and appending new ones.
 *
 * Authentication uses a Google Service Account JSON key file.
 * The service account must be granted Editor access to the spreadsheet.
 *
 * To change column order, edit COLUMNS below and update appendLeads() accordingly.
 */

const { google } = require('googleapis');
const fs = require('fs');

// Column headers — order must match the row array built in appendLeads()
const COLUMNS = [
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
 * Build a GoogleAuth client from the service account credentials file.
 */
function getAuthClient() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-credentials.json';

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      `Set GOOGLE_CREDENTIALS_PATH in your .env file or place the JSON key at the default path.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  if (credentials.type !== 'service_account') {
    throw new Error(
      'Only service account credentials are supported for automated scheduling.\n' +
      'See setup instructions for how to create a service account key.'
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  return id;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || 'Leads';
}

/**
 * Read the Business Name column (B) from the sheet and return a lowercase Set
 * for O(1) duplicate checking.
 * @returns {Set<string>}
 */
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!B:B`,
  });

  const rows = res.data.values || [];
  // rows[0] is the header "Business Name" — skip it
  return new Set(
    rows
      .slice(1)
      .map(row => (row[0] || '').toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Write the header row if the sheet is empty or missing the expected header.
 */
async function ensureHeaderRow() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const existing = res.data.values?.[0];
  if (!existing || existing[0] !== 'Date Added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [COLUMNS] },
    });
    console.log('Header row written to spreadsheet.');
  }
}

/**
 * Append an array of lead objects to the sheet as new rows.
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {{ appended: number }}
 */
async function appendLeads(leads) {
  if (!leads.length) return { appended: 0 };

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();
  const today = new Date().toLocaleDateString('en-US'); // MM/DD/YYYY

  const rows = leads.map(lead => [
    today,              // A - Date Added
    lead.businessName,  // B - Business Name
    lead.firstName,     // C - Owner First Name
    lead.lastName,      // D - Owner Last Name
    lead.phone,         // E - Phone Number
    lead.city,          // F - City
    lead.website,       // G - Website
    '',                 // H - Called (blank for manual use)
    '',                 // I - Notes (blank for manual use)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return { appended: rows.length };
}

module.exports = { appendLeads, getExistingBusinessNames, ensureHeaderRow };
