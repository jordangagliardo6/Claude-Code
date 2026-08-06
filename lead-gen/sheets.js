/**
 * Google Sheets module.
 *
 * Handles reading existing business names (for deduplication) and
 * appending new lead rows to the target spreadsheet.
 *
 * Auth: uses a Google service account JSON key file pointed to by
 * the GOOGLE_SERVICE_ACCOUNT_KEY_FILE env var, OR the inline JSON
 * stored in GOOGLE_SERVICE_ACCOUNT_JSON.
 *
 * To use OAuth2 (personal account) instead, replace the auth setup
 * below with the commented OAuth2 block and set GOOGLE_REFRESH_TOKEN,
 * GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET in your .env file.
 */

const { google } = require('googleapis');
const fs = require('fs');

// --------------------------------------------------------------------------
// Auth setup
// --------------------------------------------------------------------------

function buildAuth() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Inline JSON (good for CI / hosted environments)
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    // Path to a downloaded service account key file
    const raw = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, 'utf8');
    credentials = JSON.parse(raw);
  } else {
    throw new Error(
      'Google auth not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or ' +
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE in your .env file.',
    );
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/*
 * --- OAuth2 alternative (personal Google account) ---
 * Replace buildAuth() above with this if you prefer OAuth2 over a service account:
 *
 * function buildAuth() {
 *   const oauth2Client = new google.auth.OAuth2(
 *     process.env.GOOGLE_CLIENT_ID,
 *     process.env.GOOGLE_CLIENT_SECRET,
 *   );
 *   oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
 *   return oauth2Client;
 * }
 */

// --------------------------------------------------------------------------
// Read existing business names for deduplication
// --------------------------------------------------------------------------

/**
 * Returns a Set of business names (lowercased) already in the spreadsheet.
 *
 * @param {object} config - from config.js
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames(config) {
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Column B (index 1) is Business Name — read the whole column
  const range = `${config.sheetName}!B:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  const names = new Set();

  // Skip the header row (row 0)
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim().toLowerCase();
    if (name) names.add(name);
  }

  console.log(`[Sheets] Found ${names.size} existing business(es) in the spreadsheet.`);
  return names;
}

// --------------------------------------------------------------------------
// Append new lead rows
// --------------------------------------------------------------------------

/**
 * Appends an array of row objects to the spreadsheet.
 *
 * @param {object[]} rows   - array of flat row objects matching config.columns
 * @param {object}   config - from config.js
 * @returns {Promise<number>} number of rows successfully appended
 */
async function appendLeads(rows, config) {
  if (!rows.length) {
    console.log('[Sheets] No new rows to append.');
    return 0;
  }

  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Convert row objects to arrays in column order
  const values = rows.map((row) => config.columns.map((col) => row[col] ?? ''));

  const range = `${config.sheetName}!A:I`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });

  console.log(`[Sheets] Appended ${rows.length} new lead row(s).`);
  return rows.length;
}

// --------------------------------------------------------------------------
// Connectivity test
// --------------------------------------------------------------------------

/**
 * Verifies the sheet is reachable and returns its title.
 * Call this during first-run setup to confirm credentials work.
 *
 * @param {object} config - from config.js
 * @returns {Promise<string>} spreadsheet title
 */
async function testConnection(config) {
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: 'properties.title',
  });

  return res.data.properties.title;
}

module.exports = { getExistingBusinessNames, appendLeads, testConnection };
