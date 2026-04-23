const { google } = require('googleapis');
const path = require('path');
const { SHEET_COLUMNS, BUSINESS_NAME_COLUMN_INDEX } = require('./config');
const logger = require('./logger');

// Change this if your sheet tab has a different name
const SHEET_TAB = 'Sheet1';

// ------------------------------------------------------------------ auth

function getAuth() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  return new google.auth.GoogleAuth({
    keyFile: path.resolve(credPath),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// ------------------------------------------------------------------ helpers

/** Convert a 1-based column number to its letter (1→A, 2→B, 27→AA …). */
function colLetter(n) {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

// ------------------------------------------------------------------ sheet ops

/**
 * Write the header row if the sheet is completely empty.
 * Safe to call on every run — only fires once.
 */
async function ensureHeaderRow(sheets, spreadsheetId) {
  const lastCol = colLetter(SHEET_COLUMNS.length);
  const range = `${SHEET_TAB}!A1:${lastCol}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });

  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS] },
    });
    logger.info('Header row written to Google Sheet.');
  }
}

/**
 * Return a Set of lowercased business names already in the sheet.
 * Used for deduplication before appending.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  // Business Name is column B (BUSINESS_NAME_COLUMN_INDEX = 1, 0-based → 2 1-based)
  const col = colLetter(BUSINESS_NAME_COLUMN_INDEX + 1);
  const range = `${SHEET_TAB}!${col}:${col}`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = res.data.values || [];

  return new Set(values.flat().map(v => v.toString().toLowerCase().trim()));
}

/**
 * Append new leads to the spreadsheet, skipping duplicates.
 * Returns the number of rows actually written.
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID environment variable is not set');

  const sheets = await getSheetsClient();

  await ensureHeaderRow(sheets, spreadsheetId);

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();

    if (existingNames.has(key)) {
      skipped.push(lead.businessName);
      continue;
    }

    // Track within this batch so we don't insert the same business twice
    existingNames.add(key);

    // Column order must match SHEET_COLUMNS in config.js
    newRows.push([
      today,             // Date Added
      lead.businessName, // Business Name
      lead.firstName,    // Owner First Name
      lead.lastName,     // Owner Last Name
      lead.phone,        // Phone Number
      lead.city,         // City
      lead.website,      // Website
      '',                // Called  (blank — filled by user)
      '',                // Notes   (blank — filled by user)
    ]);
  }

  if (skipped.length > 0) {
    logger.info(`Skipped ${skipped.length} duplicate(s): ${skipped.join(', ')}`);
  }

  if (newRows.length === 0) {
    logger.info('No new leads to add — all results were duplicates.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.info(`Appended ${newRows.length} new lead(s) to Google Sheet.`);
  return newRows.length;
}

/** Quick connectivity check — fetches spreadsheet metadata only. */
async function verifyConnection() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID not set');

  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'spreadsheetId,properties',
    });
    return res.data.properties?.title || 'Untitled';
  } catch (err) {
    throw new Error(`Google Sheets connection failed: ${err.message}`);
  }
}

module.exports = { appendLeads, verifyConnection };
