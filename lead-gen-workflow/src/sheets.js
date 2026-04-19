require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const { log } = require('./logger');

// Column order must match the spreadsheet header row exactly
// To add/remove columns, update COLUMN_ORDER and the buildRow() function below
const COLUMN_ORDER = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank intentionally
  'Notes',    // left blank intentionally
];

const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// Authenticate using a Google Service Account JSON key file
function getAuth() {
  const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials/google-service-account.json');
  return new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

// Read all existing rows from the sheet, returns a 2D array
async function readAllRows(sheets) {
  const range = `${SHEET_NAME}!A:I`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return response.data.values || [];
}

// Ensure the header row exists; write it if the sheet is empty
async function ensureHeaders(sheets, rows) {
  if (rows.length === 0) {
    log.info('Sheet is empty — writing header row...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMN_ORDER] },
    });
    return true; // headers were just written
  }
  return false;
}

// Build a row array in COLUMN_ORDER from a lead object
function buildRow(lead, dateAdded) {
  return [
    dateAdded,         // Date Added
    lead.businessName, // Business Name
    lead.firstName,    // Owner First Name
    lead.lastName,     // Owner Last Name
    lead.phone,        // Phone Number
    lead.city,         // City
    lead.website,      // Website
    '',                // Called (blank)
    '',                // Notes (blank)
  ];
}

// Extract existing business names from sheet rows (column index 1 = "Business Name")
function getExistingBusinessNames(rows) {
  // Skip header row (index 0)
  const names = new Set();
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][1] || '').toLowerCase().trim();
    if (name) names.add(name);
  }
  return names;
}

// Append new leads to the spreadsheet, skipping duplicates
// Returns { added, skipped } counts
async function appendLeads(leads) {
  if (!SPREADSHEET_ID) {
    throw new Error('GOOGLE_SPREADSHEET_ID env var is not set.');
  }

  const auth = getAuth();
  const sheets = getSheetsClient(auth);

  const existingRows = await readAllRows(sheets);
  await ensureHeaders(sheets, existingRows);

  const existingNames = getExistingBusinessNames(existingRows);
  log.info(`Sheet has ${existingRows.length > 0 ? existingRows.length - 1 : 0} existing leads`);

  const dateAdded = new Date().toLocaleDateString('en-US', {
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
    timeZone: 'America/New_York',
  });

  const rowsToAdd = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (existingNames.has(key)) {
      log.info(`  SKIP (duplicate): ${lead.businessName}`);
      skipped++;
    } else {
      rowsToAdd.push(buildRow(lead, dateAdded));
      existingNames.add(key); // prevent dupes within this batch too
      log.info(`  ADD: ${lead.businessName} | ${lead.firstName} ${lead.lastName} | ${lead.phone} | ${lead.city}`);
    }
  }

  if (rowsToAdd.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rowsToAdd },
    });
    log.info(`Wrote ${rowsToAdd.length} new row(s) to Google Sheet`);
  } else {
    log.info('No new rows to write — all leads were duplicates');
  }

  return { added: rowsToAdd.length, skipped };
}

// Verify Google Sheets connection and return sheet metadata
async function verifyConnection() {
  if (!SPREADSHEET_ID) {
    throw new Error('GOOGLE_SPREADSHEET_ID env var is not set.');
  }

  const auth = getAuth();
  const sheets = getSheetsClient(auth);

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return {
    title: meta.data.properties.title,
    sheetNames: meta.data.sheets.map(s => s.properties.title),
  };
}

module.exports = { appendLeads, verifyConnection, COLUMN_ORDER };
