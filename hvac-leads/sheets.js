/**
 * Google Sheets integration
 *
 * Auth: Service Account JSON (recommended for automation).
 * Env var: GOOGLE_SERVICE_ACCOUNT_JSON — full JSON as a string, OR
 *          GOOGLE_APPLICATION_CREDENTIALS — path to the JSON file.
 *
 * Required Sheets API scope: https://www.googleapis.com/auth/spreadsheets
 */

const { google } = require('googleapis');
const config = require('./config');

/** Build an authenticated Sheets client. */
async function getSheetsClient() {
  let auth;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // JSON string stored directly in the env var
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path
    auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all existing business names from the sheet so we can skip duplicates.
 * Returns a Set of lowercase business names.
 */
async function getExistingBusinessNames(sheets) {
  const range = `${config.SHEET_NAME}!B2:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  return new Set(rows.map((r) => (r[0] || '').trim().toLowerCase()));
}

/**
 * Ensure the header row exists. If the sheet is empty, writes it.
 */
async function ensureHeader(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A1:I1`,
  });

  const firstRow = (res.data.values || [])[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.COLUMNS] },
    });
    console.log('Header row written.');
  }
}

/**
 * Append new lead rows to the sheet.
 * Skips any lead whose business name already appears in existingNames.
 *
 * @param {Array}  leads         - normalized lead objects from apollo.js
 * @param {Set}    existingNames - lowercase set of already-present business names
 * @param {object} sheets        - authenticated Sheets client
 * @returns {number} count of rows actually appended
 */
async function appendLeads(leads, existingNames, sheets) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const rows = [];

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (!key) continue;
    if (existingNames.has(key)) {
      console.log(`Skipping duplicate: ${lead.businessName}`);
      continue;
    }

    rows.push([
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

    existingNames.add(key); // prevent intra-run dupes
  }

  if (rows.length === 0) {
    console.log('No new leads to append.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`Appended ${rows.length} new lead(s).`);
  return rows.length;
}

module.exports = { getSheetsClient, getExistingBusinessNames, ensureHeader, appendLeads };
