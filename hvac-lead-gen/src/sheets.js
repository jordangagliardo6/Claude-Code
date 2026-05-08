'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');
const logger = require('./logger');

// ── Column layout ─────────────────────────────────────────────────────────────
// If you ever reorder columns, only change this map — everything else uses it.
const COLUMNS = {
  dateAdded:  0, // A
  business:   1, // B  ← used for duplicate detection
  firstName:  2, // C
  lastName:   3, // D
  phone:      4, // E
  city:       5, // F
  website:    6, // G
  called:     7, // H  (left blank)
  notes:      8, // I  (left blank)
};

const HEADER_ROW = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

// ── Auth ──────────────────────────────────────────────────────────────────────

function buildAuth() {
  // Option 1: explicit path to service-account JSON in credentials/
  const localCreds = path.join(__dirname, '..', 'credentials', 'google-service-account.json');

  // Option 2: GOOGLE_APPLICATION_CREDENTIALS env var (standard GCP convention)
  const envCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  let keyFile;
  if (fs.existsSync(localCreds)) {
    keyFile = localCreds;
  } else if (envCreds && fs.existsSync(envCreds)) {
    keyFile = envCreds;
  } else {
    throw new Error(
      'Google credentials not found.\n' +
      '  Option A: place google-service-account.json in the credentials/ folder.\n' +
      '  Option B: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/file in your .env.'
    );
  }

  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function sheetsClient() {
  return google.sheets({ version: 'v4', auth: buildAuth() });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set. Add the spreadsheet ID to your .env file.');
  }
  return id;
}

function getSheetName() {
  // Default tab name is "Sheet1"; override via GOOGLE_SHEET_NAME if yours differs.
  return process.env.GOOGLE_SHEET_NAME || 'Sheet1';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return a Set of business names already in the spreadsheet (case-insensitive).
 * Used for duplicate detection before appending.
 */
async function getExistingBusinessNames() {
  const sheets = sheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  // Read column B starting from row 2 (skip header)
  const range = `${sheetName}!B2:B`;

  let response;
  try {
    response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  } catch (err) {
    throw buildSheetsError(err);
  }

  const rows = response.data.values ?? [];
  const names = new Set(rows.flat().map(n => n.trim().toLowerCase()).filter(Boolean));
  logger.log(`Spreadsheet has ${names.size} existing business names.`);
  return names;
}

/**
 * Append an array of lead objects to the spreadsheet.
 * Ensures the header row exists before writing data.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {Promise<number>} number of rows actually written
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = sheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  await ensureHeaderRow(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const rows = leads.map(lead => {
    const row = new Array(HEADER_ROW.length).fill('');
    row[COLUMNS.dateAdded] = today;
    row[COLUMNS.business]  = lead.businessName;
    row[COLUMNS.firstName] = lead.firstName;
    row[COLUMNS.lastName]  = lead.lastName;
    row[COLUMNS.phone]     = lead.phone;
    row[COLUMNS.city]      = lead.city;
    row[COLUMNS.website]   = lead.website;
    // called and notes stay blank
    return row;
  });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
  } catch (err) {
    throw buildSheetsError(err);
  }

  logger.log(`Appended ${rows.length} new leads to the spreadsheet.`);
  return rows.length;
}

/**
 * Lightweight connection test — reads spreadsheet metadata only.
 */
async function testConnection() {
  const sheets = sheetsClient();
  const spreadsheetId = getSpreadsheetId();

  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'spreadsheetId,properties.title,sheets.properties.title',
    });
    const title  = response.data.properties?.title ?? '(untitled)';
    const tabs   = (response.data.sheets ?? []).map(s => s.properties?.title).join(', ');
    return { success: true, message: `Connected. Spreadsheet: "${title}" — tabs: ${tabs}` };
  } catch (err) {
    throw buildSheetsError(err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureHeaderRow(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:${columnLetter(HEADER_ROW.length - 1)}1`;

  let existing;
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    existing = res.data.values?.[0] ?? [];
  } catch (_) {
    existing = [];
  }

  // If cell A1 is empty or doesn't look like our header, write it.
  if (!existing[0] || existing[0].toLowerCase() !== 'date added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    logger.log('Header row written to spreadsheet.');
  }
}

// Convert 0-based column index to A1 letter (0→A, 1→B, …, 25→Z)
function columnLetter(index) {
  return String.fromCharCode(65 + index);
}

function buildSheetsError(err) {
  const msg = err.errors?.[0]?.message
    || err.message
    || 'Unknown Google Sheets error';
  const code = err.code ?? err.status ?? '';
  return new Error(`Google Sheets error${code ? ` (${code})` : ''}: ${msg}`);
}

module.exports = { getExistingBusinessNames, appendLeads, testConnection };
