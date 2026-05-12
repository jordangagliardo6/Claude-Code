// Google Sheets integration via service account credentials
// Docs: https://developers.google.com/sheets/api/reference/rest

const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');
const config     = require('./config');
const logger     = require('./logger');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Build an authenticated Sheets client using service account credentials
function buildClient() {
  const keyPath = path.resolve(config.sheets.credentialsPath);

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Google credentials file not found at: ${keyPath}\n` +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH in your .env file.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: SCOPES,
  });

  return google.sheets({ version: 'v4', auth });
}

// Return the full range string for the active sheet, e.g. "Leads!A:I"
function sheetRange(columns = 'A:I') {
  return `${config.sheets.sheetName}!${columns}`;
}

// Verify the spreadsheet is accessible and the header row exists.
// Writes the header row if the sheet is empty.
async function testConnection() {
  if (!config.sheets.spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  }

  const sheets = buildClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: sheetRange('A1:I1'),
  });

  const existingHeader = res.data.values?.[0] || [];

  if (existingHeader.length === 0) {
    // Sheet is blank — write the header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheets.spreadsheetId,
      range: sheetRange('A1'),
      valueInputOption: 'RAW',
      requestBody: { values: [config.sheets.headers] },
    });
    logger.info('Google Sheets: header row written (sheet was empty).');
  } else {
    logger.info(`Google Sheets: header row found → [${existingHeader.join(', ')}]`);
  }

  logger.success('Google Sheets connection verified.');
  return true;
}

// Fetch all existing Business Name values for deduplication.
// Uses column B (index 1) as configured by dedupeColumnIndex.
async function getExistingBusinessNames(sheets) {
  const col  = String.fromCharCode(65 + config.sheets.dedupeColumnIndex); // "B"
  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: sheetRange(`${col}2:${col}10000`), // skip header row
  });

  const rows = res.data.values || [];
  return new Set(rows.flat().map((name) => name.trim().toLowerCase()));
}

// Convert a normalized lead object into a spreadsheet row array.
// Column order must match config.sheets.headers.
function buildRow(lead) {
  const today = new Date().toLocaleDateString('en-US', {
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
    timeZone: 'America/New_York',
  });

  return [
    today,             // Date Added
    lead.companyName,  // Business Name
    lead.firstName,    // Owner First Name
    lead.lastName,     // Owner Last Name
    lead.phone,        // Phone Number
    lead.city,         // City
    lead.website,      // Website
    '',                // Called (blank)
    '',                // Notes  (blank)
  ];
}

// Append new leads to the spreadsheet, skipping duplicates.
// Returns { added, skipped } counts.
async function appendLeads(leads) {
  if (!config.sheets.spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  }
  if (leads.length === 0) {
    logger.info('No leads to append.');
    return { added: 0, skipped: 0 };
  }

  const sheets        = buildClient();
  const existingNames = await getExistingBusinessNames(sheets);

  logger.info(`Sheet already contains ${existingNames.size} unique business name(s).`);

  const newRows  = [];
  let skipped    = 0;

  for (const lead of leads) {
    const key = lead.companyName.trim().toLowerCase();
    if (existingNames.has(key)) {
      logger.warn(`  Skipping duplicate: "${lead.companyName}"`);
      skipped++;
    } else {
      newRows.push(buildRow(lead));
      existingNames.add(key); // prevent dupes within this batch too
    }
  }

  if (newRows.length === 0) {
    logger.info('All leads were duplicates — nothing appended.');
    return { added: 0, skipped };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheets.spreadsheetId,
    range: sheetRange('A1'),        // Sheets API finds the next empty row automatically
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.success(`Appended ${newRows.length} new lead(s) to Google Sheets.`);
  return { added: newRows.length, skipped };
}

module.exports = { testConnection, appendLeads };
