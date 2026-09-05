/**
 * googleSheets.js
 * Reads existing leads from Google Sheets and appends new ones.
 * Uses a Google Service Account (JSON key file) for auth — no browser OAuth flow needed.
 *
 * Setup:
 * 1. Create a Service Account in Google Cloud Console
 * 2. Download the JSON key file and set GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
 * 3. Share your Google Sheet with the service account email (edit access)
 */

const { google } = require('googleapis');
const fs = require('fs');
const config = require('./config');

let sheetsClient = null;

/**
 * Initialize the Google Sheets API client using the service account credentials.
 * Cached after first call.
 */
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE environment variable is not set.\n' +
      'Point it to the path of your service account JSON key file.\n' +
      'Example: GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json'
    );
  }

  if (!fs.existsSync(keyFile)) {
    throw new Error(`Service account key file not found: ${keyFile}`);
  }

  const credentials = JSON.parse(fs.readFileSync(keyFile, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Read all existing business names from column B (Business Name) of the sheet.
 * Returns a Set of lowercase business names for O(1) dedup lookup.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();

  const range = `${config.sheetName}!B:B`; // Column B = Business Name

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });

  const rows = response.data.values || [];

  // Skip header row (row 1), normalize to lowercase
  return new Set(
    rows
      .slice(1)
      .map((row) => (row[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Build a single row array in the order matching config.columnHeaders.
 * Columns: Date Added | Business Name | Owner First | Owner Last | Phone | City | Website | Called | Notes
 *
 * @param {object} lead - normalized lead from apolloSearch.js
 * @returns {Array}
 */
function buildRow(lead) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return [
    today,               // Date Added
    lead.businessName,   // Business Name
    lead.firstName,      // Owner First Name
    lead.lastName,       // Owner Last Name
    lead.phone,          // Phone Number
    lead.city,           // City
    lead.website,        // Website
    '',                  // Called (blank — user fills in)
    '',                  // Notes (blank — user fills in)
  ];
}

/**
 * Append an array of leads to the bottom of the Google Sheet.
 * Uses APPEND mode so it never overwrites existing rows.
 *
 * @param {Array} leads - array of normalized lead objects
 * @returns {Promise<number>} - number of rows appended
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = await getSheetsClient();

  const rows = leads.map(buildRow);
  const range = `${config.sheetName}!A:I`; // A through I (9 columns)

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED', // lets Google parse dates and URLs
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows,
    },
  });

  return rows.length;
}

/**
 * Smoke-test the Sheets connection by reading the spreadsheet metadata.
 * Returns { ok: true, title } or { ok: false, error }.
 */
async function testConnection() {
  try {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
    });
    return {
      ok: true,
      title: meta.data.properties.title,
      url: `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
    };
  }
}

module.exports = { getExistingBusinessNames, appendLeads, testConnection };
