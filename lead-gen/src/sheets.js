'use strict';

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const logger = require('./logger');

// ─────────────────────────────────────────────────────────────────────────────
// Column layout — edit COLUMNS to reorder or rename columns at any time.
// The array index (0-based) determines the spreadsheet column order.
// ─────────────────────────────────────────────────────────────────────────────
const COLUMNS = [
  'Date Added',     // A
  'Business Name',  // B  ← deduplication key
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',   // E
  'City',           // F
  'Website',        // G
  'Called',         // H  (left blank by workflow)
  'Notes',          // I  (left blank by workflow)
];

const BUSINESS_NAME_COL_INDEX = 1; // column B (0-based)

// Build and cache the authenticated Sheets client.
let _sheetsClient = null;

function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set in environment');
  if (!fs.existsSync(keyPath)) throw new Error(`Service account key not found at: ${keyPath}`);

  const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID is not set in environment');
  return id;
}

function getSheetName() {
  return process.env.SHEET_NAME || 'Sheet1';
}

// ─────────────────────────────────────────────────────────────────────────────
// Ensure the header row exists. Writes it only if row 1 is empty.
// ─────────────────────────────────────────────────────────────────────────────
async function ensureHeaders() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:${String.fromCharCode(65 + COLUMNS.length - 1)}1`,
  });

  const existingRow = (res.data.values || [])[0] || [];
  if (existingRow.length > 0) return; // headers already present

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNS] },
  });
  logger.info('Header row written to spreadsheet');
}

// ─────────────────────────────────────────────────────────────────────────────
// Returns a Set of business names already in column B (case-insensitive).
// ─────────────────────────────────────────────────────────────────────────────
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Read only column B to avoid fetching the entire sheet on large datasets.
    range: `${sheetName}!B:B`,
  });

  const rows = res.data.values || [];
  // rows[0] is the header ("Business Name"), skip it
  const names = rows
    .slice(1)
    .map((r) => (r[0] || '').toLowerCase().trim())
    .filter(Boolean);

  return new Set(names);
}

// ─────────────────────────────────────────────────────────────────────────────
// Appends an array of lead objects to the spreadsheet.
// Returns the number of rows actually written (after dedup).
//
// @param {Lead[]} leads     - normalized lead objects from apollo.js
// @param {Set}    existing  - set of lowercase business names already in sheet
// ─────────────────────────────────────────────────────────────────────────────
async function appendLeads(leads, existing) {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

  const newRows = [];
  for (const lead of leads) {
    const key = (lead.businessName || '').toLowerCase().trim();
    if (!key) continue;
    if (existing.has(key)) {
      logger.info(`Skipping duplicate: ${lead.businessName}`);
      continue;
    }
    existing.add(key); // prevent dupes within the same batch

    // Row order must match COLUMNS array above.
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — left blank
      '', // Notes — left blank
    ]);
  }

  if (newRows.length === 0) {
    logger.info('No new rows to write after deduplication');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.success(`Wrote ${newRows.length} new lead(s) to spreadsheet`);
  return newRows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight connectivity test — reads sheet metadata only.
// ─────────────────────────────────────────────────────────────────────────────
async function testConnection() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties?.title || '(unnamed)';
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendLeads, testConnection, COLUMNS };
