'use strict';

/**
 * Google Sheets API client
 *
 * Handles reading existing leads and appending new rows to the target
 * spreadsheet. Uses a Google service account for authentication — no
 * browser-based OAuth flow required, making it suitable for unattended cron.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_FILE  Path to the service account JSON key
 *   SPREADSHEET_ID                   ID from the Google Sheets URL
 *   SHEET_NAME                       Tab name (default: "Sheet1")
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Column layout — edit COLUMN_HEADERS to change the spreadsheet structure.
// The order here must match the order used in rowFromLead() below.
// ---------------------------------------------------------------------------
const COLUMN_HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',  // left blank by the workflow
  'Notes',   // left blank by the workflow
];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function loadCredentials() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE environment variable is not set. ' +
        'Point it at your service account JSON key file.'
    );
  }

  const resolved = path.resolve(keyFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Service account key file not found at: ${resolved}\n` +
        'Download it from Google Cloud Console → IAM → Service Accounts → Keys.'
    );
  }

  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function getAuthClient() {
  const credentials = loadCredentials();
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID environment variable is not set');
  return id;
}

function getSheetName() {
  return process.env.SHEET_NAME || 'Sheet1';
}

/** Formats a Date as MM/DD/YYYY */
function formatDate(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Converts a normalized lead object into a spreadsheet row array.
 * The order must match COLUMN_HEADERS.
 *
 * @param {object} lead - Normalized lead from apollo.js
 * @returns {string[]}
 */
function rowFromLead(lead) {
  return [
    formatDate(),          // Date Added
    lead.businessName,     // Business Name
    lead.firstName,        // Owner First Name
    lead.lastName,         // Owner Last Name
    lead.phone,            // Phone Number
    lead.city,             // City
    lead.website,          // Website
    '',                    // Called (blank)
    '',                    // Notes (blank)
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates the connection by reading the spreadsheet's metadata.
 * Throws on auth failure, missing spreadsheet, or permission errors.
 *
 * @returns {string} - The spreadsheet title
 */
async function testConnection() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const response = await sheets.spreadsheets.get({ spreadsheetId });
  return response.data.properties.title;
}

/**
 * Returns a Set of existing business names (lowercase) from column B.
 * Column B is index 1 in the sheet (0-indexed).
 * The first row (header) is excluded automatically because "Business Name"
 * won't match any real company name.
 *
 * @returns {Set<string>} - Lowercase business names already in the sheet
 */
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  // Read only column B to minimize data transfer
  const range = `${sheetName}!B:B`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = response.data.values || [];
  // rows[0] is the header "Business Name" — included in Set but won't match real companies
  return new Set(rows.flat().map((name) => String(name).toLowerCase().trim()));
}

/**
 * Ensures the header row exists. If the sheet is completely empty (A1 is
 * blank), writes COLUMN_HEADERS as the first row.
 */
async function ensureHeaderRow() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const a1 = (response.data.values || [['']])[0][0];
  if (!a1 || String(a1).trim() === '') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMN_HEADERS] },
    });
  }
}

/**
 * Appends an array of lead rows to the sheet.
 * Uses RAW input so phone numbers aren't auto-reformatted by Sheets.
 *
 * @param {object[]} leads - Array of normalized lead objects to append
 * @returns {number}       - Number of rows actually written
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const rows = leads.map(rowFromLead);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    // Appending to column A forces Sheets to find the first empty row
    range: `${sheetName}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = {
  testConnection,
  getExistingBusinessNames,
  ensureHeaderRow,
  appendLeads,
  COLUMN_HEADERS,
};
