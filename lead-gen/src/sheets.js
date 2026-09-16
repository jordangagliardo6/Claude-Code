/**
 * sheets.js — Google Sheets API client for reading and appending leads.
 *
 * Authentication options (choose one — see README for setup):
 *   A) Service Account: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   B) OAuth2 tokens:   set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *
 * The spreadsheet must be shared with the service account email (option A)
 * or owned/accessible by the authenticated Google account (option B).
 */

const { google } = require('googleapis');

/**
 * Build and return an authenticated Google Sheets API client.
 * Tries service account first, then OAuth2.
 *
 * @returns {Promise<object>} Authenticated sheets client
 */
async function getSheetsClient() {
  let auth;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Option A: Service Account JSON file
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    // Option B: OAuth2 with stored refresh token
    const oAuth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oAuth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    auth = oAuth2;
  } else {
    throw new Error(
      'Google auth not configured. Set GOOGLE_APPLICATION_CREDENTIALS (service account) ' +
      'or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (OAuth2).',
    );
  }

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read the Business Name column from the spreadsheet and return a Set of
 * lowercase-trimmed names for fast deduplication.
 *
 * Assumes row 1 is the header row and "Business Name" is column B (index 1).
 *
 * @param {object} sheets        - Authenticated sheets client
 * @param {string} spreadsheetId
 * @param {string} tabName
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames(sheets, spreadsheetId, tabName) {
  // Read the entire B column (Business Name) starting at row 2
  const range = `${tabName}!B2:B`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  const names = new Set(rows.flatMap((row) => row).map((n) => n.trim().toLowerCase()));
  console.log(`[Sheets] Found ${names.size} existing business names in spreadsheet`);
  return names;
}

/**
 * Append an array of leads as new rows to the bottom of the spreadsheet.
 * Each lead is mapped to the column order defined in config.COLUMNS.
 *
 * @param {object}   sheets        - Authenticated sheets client
 * @param {string}   spreadsheetId
 * @param {string}   tabName
 * @param {object[]} leads         - Array of lead objects
 * @param {string[]} columns       - Ordered column names from config
 * @returns {Promise<number>}      - Number of rows appended
 */
async function appendLeadsToSheet(sheets, spreadsheetId, tabName, leads, columns) {
  if (leads.length === 0) {
    console.log('[Sheets] No new leads to append');
    return 0;
  }

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  // Map each lead object to an ordered row array matching COLUMNS
  const rows = leads.map((lead) => columns.map((col) => {
    switch (col) {
      case 'Date Added':     return today;
      case 'Business Name':  return lead.businessName;
      case 'Owner First Name': return lead.firstName;
      case 'Owner Last Name':  return lead.lastName;
      case 'Phone Number':   return lead.phone;
      case 'City':           return lead.city;
      case 'Website':        return lead.website;
      case 'Called':         return '';  // intentionally blank
      case 'Notes':          return '';  // intentionally blank
      default:               return '';
    }
  }));

  const range = `${tabName}!A:I`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new leads`);
  return rows.length;
}

module.exports = { getSheetsClient, getExistingBusinessNames, appendLeadsToSheet };
