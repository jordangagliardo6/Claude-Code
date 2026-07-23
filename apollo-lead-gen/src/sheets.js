'use strict';

const { google }  = require('googleapis');
const fs          = require('fs');
const path        = require('path');
const { SHEET_HEADERS, COLUMN_MAP } = require('./config');
const log         = require('./logger');

// Build a Google Sheets client authenticated via a service account.
function buildSheetsClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set');

  const resolved = path.resolve(keyFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account key file not found: ${resolved}`);
  }

  const credentials = JSON.parse(fs.readFileSync(resolved, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Read all business names already in the sheet (column B, index 1).
// Returns a Set of lowercase names for O(1) duplicate checking.
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!B:B`;  // Business Name column

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = data.values ?? [];
  const names = new Set();

  // Skip header row (row 0), collect the rest
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i]?.[0]?.trim().toLowerCase();
    if (name) names.add(name);
  }

  return names;
}

// Ensure the sheet has headers in row 1. Writes them if the sheet is blank.
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:I1`;

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  // Sheet is blank — write the header row
  if (!data.values || data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_HEADERS] },
    });
    log.info('Header row written to sheet');
  }
}

// Append new leads to the sheet, skipping any duplicates.
// Returns { added, skipped } counts.
async function appendLeads(leads) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName     = process.env.GOOGLE_SHEET_NAME || 'Leads';

  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set');

  const sheets = buildSheetsClient();

  await ensureHeaders(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);
  log.info(`Sheet currently has ${existing.size} existing businesses`);

  const dateAdded = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    if (existing.has(lead.businessName.toLowerCase())) {
      log.info(`  Skipping duplicate: "${lead.businessName}"`);
      skipped++;
      continue;
    }

    // Build row in the order defined by SHEET_HEADERS / COLUMN_MAP
    const row = new Array(SHEET_HEADERS.length).fill('');
    row[COLUMN_MAP.dateAdded]    = dateAdded;
    row[COLUMN_MAP.businessName] = lead.businessName;
    row[COLUMN_MAP.firstName]    = lead.firstName;
    row[COLUMN_MAP.lastName]     = lead.lastName;
    row[COLUMN_MAP.phone]        = lead.phone;
    row[COLUMN_MAP.city]         = lead.city;
    row[COLUMN_MAP.website]      = lead.website;
    // Called (col 7) and Notes (col 8) stay blank

    newRows.push(row);
    existing.add(lead.businessName.toLowerCase()); // prevent intra-run dupes
  }

  if (newRows.length === 0) {
    log.info('No new leads to add — all were duplicates');
    return { added: 0, skipped };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  log.info(`Appended ${newRows.length} new leads to "${sheetName}"`);
  return { added: newRows.length, skipped };
}

// Verify the sheet is reachable — used by test-connection.js
async function testConnection() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName     = process.env.GOOGLE_SHEET_NAME || 'Leads';

  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set');

  const sheets = buildSheetsClient();

  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = data.sheets?.some(s => s.properties.title === sheetName);

  return {
    spreadsheetTitle: data.properties?.title,
    sheetExists,
    sheetName,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

module.exports = { appendLeads, testConnection };
