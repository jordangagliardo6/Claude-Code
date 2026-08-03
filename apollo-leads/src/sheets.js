/**
 * Google Sheets client.
 *
 * Authentication: service account JSON file (GOOGLE_CREDENTIALS_PATH).
 * The service account must have "Editor" access to the spreadsheet.
 *
 * Alternatively, set GOOGLE_APPLICATION_CREDENTIALS in the environment
 * if you're running on GCP or using Application Default Credentials.
 *
 * Sheet layout (row 1 = headers):
 *   A: Date Added  B: Business Name  C: First Name  D: Last Name
 *   E: Phone       F: City           G: Website     H: Called     I: Notes
 */

const { google } = require('googleapis');
const path = require('path');
const fs   = require('fs');
const config = require('./config');
const logger = require('./logger');

let _sheets = null; // cached authenticated client

/**
 * Build and cache an authenticated Google Sheets client.
 */
async function getSheetsClient() {
  if (_sheets) return _sheets;

  let auth;

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;

  if (credPath && fs.existsSync(path.resolve(credPath))) {
    // Service account JSON file
    const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(credPath), 'utf8'));
    auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    logger.info('Google Sheets: authenticated via service account file');
  } else {
    // Application Default Credentials (GCP, etc.)
    auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    logger.info('Google Sheets: authenticated via Application Default Credentials');
  }

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/**
 * Ensure the header row exists. If the sheet is empty, write headers.
 */
async function ensureHeaders(spreadsheetId) {
  const sheets = await getSheetsClient();
  const range  = `${config.sheet.sheetName}!A1:I1`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];

  if (!rows.length || rows[0][0] !== 'Date Added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [config.sheet.headers] },
    });
    logger.info('Google Sheets: wrote header row');
  }
}

/**
 * Read all existing business names from column B to use for deduplication.
 * Returns a Set of lowercased business names.
 *
 * @param {string} spreadsheetId
 * @returns {Set<string>}
 */
async function getExistingBusinessNames(spreadsheetId) {
  const sheets = await getSheetsClient();

  // Read column B (Business Name) from row 2 onwards
  const range = `${config.sheet.sheetName}!B2:B`;
  const res   = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows  = res.data.values || [];

  const names = new Set(rows.flat().map((n) => n.toLowerCase().trim()));
  logger.info(`Google Sheets: found ${names.size} existing business names`);
  return names;
}

/**
 * Append new lead rows to the spreadsheet.
 *
 * @param {string}   spreadsheetId
 * @param {object[]} leads   - array of { businessName, firstName, lastName, phone, city, website }
 * @returns {number}         - number of rows actually appended
 */
async function appendLeads(spreadsheetId, leads) {
  if (!leads.length) return 0;

  const sheets  = await getSheetsClient();
  const today   = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const rows = leads.map((lead) => [
    today,                // A: Date Added
    lead.businessName,    // B: Business Name
    lead.firstName,       // C: Owner First Name
    lead.lastName,        // D: Owner Last Name
    lead.phone,           // E: Phone Number
    lead.city,            // F: City
    lead.website,         // G: Website
    '',                   // H: Called (blank)
    '',                   // I: Notes (blank)
  ]);

  const range = `${config.sheet.sheetName}!A:I`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Google Sheets: appended ${rows.length} new lead rows`);
  return rows.length;
}

/**
 * Full connection test — verifies credentials and sheet access.
 * @param {string} spreadsheetId
 * @returns {{ ok: boolean, message: string }}
 */
async function testConnection(spreadsheetId) {
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    const title = res.data.properties?.title || '(unknown)';
    return { ok: true, message: `Connected to spreadsheet: "${title}"` };
  } catch (err) {
    return { ok: false, message: `Google Sheets connection failed: ${err.message}` };
  }
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendLeads, testConnection };
