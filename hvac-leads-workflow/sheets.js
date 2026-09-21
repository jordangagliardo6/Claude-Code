/**
 * Google Sheets client for reading existing leads and appending new ones.
 *
 * Authentication: Service account (credentials.json).
 * See README.md for setup steps.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let sheetsClient = null;

async function getClient() {
  if (sheetsClient) return sheetsClient;

  const credPath = path.resolve(config.google.credentialsFile);
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      'See README.md → "Google Sheets Setup" for how to create it.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Returns a Set of business names already in the spreadsheet (normalized to lowercase).
 * Used for deduplication before appending new rows.
 */
async function getExistingBusinessNames() {
  const sheets = await getClient();
  const { spreadsheetId, sheetTabName } = config.google;

  // Read column B (Business Name) — column index 1
  const range = `'${sheetTabName}'!B:B`;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = res.data.values || [];
    // Skip header row (index 0), normalize names for case-insensitive comparison
    return new Set(
      rows.slice(1)
        .map(r => (r[0] || '').trim().toLowerCase())
        .filter(Boolean)
    );
  } catch (err) {
    if (err.code === 404 || err.message?.includes('not found')) {
      throw new Error(
        `Spreadsheet not found (ID: ${spreadsheetId}).\n` +
        'Check SPREADSHEET_ID in your .env file and make sure the service account has access.'
      );
    }
    throw err;
  }
}

/**
 * Ensure the sheet has the correct header row.
 * If the sheet is empty, writes the header. If headers exist, validates them.
 */
async function ensureHeaders() {
  const sheets = await getClient();
  const { spreadsheetId, sheetTabName, columns } = config.google;
  const range = `'${sheetTabName}'!A1:I1`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = res.data.values?.[0];

  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [columns] },
    });
    console.log('  Header row written to sheet.');
  }
}

/**
 * Append an array of lead objects to the spreadsheet.
 * Each lead must have: firstName, lastName, company, phone, city, website.
 *
 * @param {Array} leads - Array of lead objects from apollo.js
 * @returns {number} Number of rows successfully appended
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const sheets = await getClient();
  const { spreadsheetId, sheetTabName } = config.google;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const rows = leads.map(lead => buildRow(lead, today));

  const range = `'${sheetTabName}'!A:I`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Build a single sheet row from a lead object.
 * Column order: Date Added, Business Name, Owner First Name, Owner Last Name,
 *               Phone Number, City, Website, Called (blank), Notes (blank)
 *
 * If you add columns to config.google.columns, also update this function.
 */
function buildRow(lead, dateAdded) {
  return [
    dateAdded,          // Date Added
    lead.company,       // Business Name
    lead.firstName,     // Owner First Name
    lead.lastName,      // Owner Last Name
    lead.phone,         // Phone Number
    lead.city,          // City
    lead.website || '', // Website
    '',                 // Called (blank — fill in manually)
    '',                 // Notes (blank — fill in manually)
  ];
}

module.exports = { getExistingBusinessNames, ensureHeaders, appendLeads };
