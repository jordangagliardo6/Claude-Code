/**
 * sheets.js
 * Handles all Google Sheets read/write operations.
 * Uses a service account for server-side auth (no browser required).
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Build an authenticated Google Sheets client.
 * Supports both a credentials JSON file and an inlined JSON string (env var).
 */
async function getClient() {
  let credentials;

  if (config.GOOGLE_CREDENTIALS_JSON) {
    // Inline JSON — useful in containerized / CI environments
    const raw = Buffer.from(config.GOOGLE_CREDENTIALS_JSON, 'base64').toString('utf8');
    credentials = JSON.parse(raw);
  } else {
    const credPath = path.resolve(__dirname, config.GOOGLE_CREDENTIALS_FILE);
    if (!fs.existsSync(credPath)) {
      throw new Error(
        `Google credentials file not found: ${credPath}\n` +
        'Create a service account at https://console.cloud.google.com and save the JSON key there.\n' +
        'Then share your spreadsheet with the service account email.'
      );
    }
    credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all values from the sheet and return the full 2-D array.
 * Returns [] if the sheet is empty.
 */
async function readSheet(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.GOOGLE_SHEET_ID,
    range: `${config.GOOGLE_SHEET_TAB_NAME}!A:Z`,
  });
  return res.data.values || [];
}

/**
 * Ensure the header row exists; write it if the sheet is empty.
 */
async function ensureHeaders(sheets) {
  const rows = await readSheet(sheets);
  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.GOOGLE_SHEET_ID,
      range: `${config.GOOGLE_SHEET_TAB_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.SHEET_COLUMNS] },
    });
    console.log('  Created header row in sheet.');
  }
}

/**
 * Return a Set of lowercased business names already in the sheet.
 * Used to prevent duplicate entries.
 */
async function getExistingBusinessNames(sheets) {
  const rows = await readSheet(sheets);
  if (rows.length <= 1) return new Set(); // empty or header-only

  const headerRow = rows[0];
  const colIndex = headerRow.indexOf(config.DUPLICATE_CHECK_COLUMN);
  if (colIndex === -1) return new Set();

  const names = new Set();
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][colIndex] || '').trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

/**
 * Append an array of lead objects to the sheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 * Skips leads whose business name is already in existingNames.
 *
 * @returns {number} count of rows actually written
 */
async function appendLeads(sheets, leads, existingNames) {
  const today = new Date().toLocaleDateString('en-US', { timeZone: config.SCHEDULER_TIMEZONE });
  const newRows = [];

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (!key || existingNames.has(key)) continue;

    // Column order must match SHEET_COLUMNS in config.js
    newRows.push([
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

    existingNames.add(key); // prevent in-batch duplicates
  }

  if (newRows.length === 0) return 0;

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.GOOGLE_SHEET_ID,
    range: `${config.GOOGLE_SHEET_TAB_NAME}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return newRows.length;
}

/**
 * Verify connection to the Google Sheet by reading its metadata.
 * Throws if the sheet cannot be reached or permissions are missing.
 */
async function verifyConnection() {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.GOOGLE_SHEET_ID,
    fields: 'properties.title',
  });
  return res.data.properties?.title || '(untitled)';
}

module.exports = { getClient, ensureHeaders, getExistingBusinessNames, appendLeads, verifyConnection };
