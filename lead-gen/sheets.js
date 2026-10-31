'use strict';

const { google } = require('googleapis');

/**
 * Build an authenticated Google Sheets client using a service account.
 *
 * The service account key file path comes from GOOGLE_CREDENTIALS_PATH.
 * Make sure the service account has been granted Editor access to your sheet.
 */
async function getSheetsClient() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!credPath) throw new Error('GOOGLE_CREDENTIALS_PATH environment variable is not set');

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Verify the connection by reading spreadsheet metadata.
 * Throws if the sheet cannot be reached or the service account lacks access.
 */
async function verifyConnection(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties?.title || '(untitled)';
}

/**
 * Ensure the first row of the sheet contains the expected column headers.
 * If row 1 is empty, headers are written. If row 1 already has content,
 * it is left untouched (assumes headers were set manually).
 */
async function ensureHeaders(sheets, spreadsheetId, tab, columns) {
  const range = `${tab}!A1:${columnLetter(columns.length)}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = res.data.values?.[0] ?? [];

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [columns] },
    });
    console.log(`  Headers written to ${tab} row 1`);
  } else {
    console.log(`  Headers already present in ${tab} row 1`);
  }
}

/**
 * Read all values in the Business Name column (column B) and return a Set
 * of lowercase, trimmed names. Used to detect duplicates before appending.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!B:B`,
  });

  const rows = res.data.values ?? [];
  const names = new Set();

  // Row 0 is the header — skip it
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i]?.[0];
    if (name) names.add(name.toLowerCase().trim());
  }

  return names;
}

/**
 * Append an array of lead objects to the sheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 * Date Added is set to today in Eastern Time.
 *
 * Returns the number of rows successfully appended.
 */
async function appendLeads(sheets, spreadsheetId, tab, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const rows = leads.map(lead => [
    today,             // A: Date Added
    lead.businessName, // B: Business Name
    lead.firstName,    // C: Owner First Name
    lead.lastName,     // D: Owner Last Name
    lead.phone,        // E: Phone Number
    lead.city,         // F: City
    lead.website,      // G: Website
    '',                // H: Called   (you fill in)
    '',                // I: Notes    (you fill in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// Convert a 1-based column index to a spreadsheet letter (1→A, 26→Z, 27→AA…)
function columnLetter(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

module.exports = {
  getSheetsClient,
  verifyConnection,
  ensureHeaders,
  getExistingBusinessNames,
  appendLeads,
};
