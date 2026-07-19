'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { SHEET_COLUMNS } = require('./config');

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Build a Google Sheets client authenticated via service account credentials.
 * The credentials file path comes from GOOGLE_CREDENTIALS_PATH env var.
 */
function buildSheetsClient() {
  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'
  );

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      'Set GOOGLE_CREDENTIALS_PATH in your .env file to point at your ' +
      'service account JSON downloaded from Google Cloud Console.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID is not set in environment variables.');
  return id;
}

function getSheetName() {
  return process.env.SHEET_NAME || 'Sheet1';
}

/** Return today's date as MM/DD/YYYY */
function todayLabel() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/**
 * Convert a column index (0-based) to an A1 column letter, e.g. 0→A, 25→Z, 26→AA.
 */
function colLetter(index) {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** Build the A1 range string for the entire sheet: e.g. "Sheet1!A:I" */
function fullRange() {
  const last = colLetter(SHEET_COLUMNS.length - 1);
  return `${getSheetName()}!A:${last}`;
}

// ─── Main Exports ─────────────────────────────────────────────────────────────

/**
 * Verify connection to the spreadsheet.
 * Returns the spreadsheet title on success or throws on failure.
 */
async function testConnection() {
  const sheets = buildSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties.title;
}

/**
 * Ensure the header row exists.  If row 1 is empty, write the column headers.
 */
async function ensureHeaders(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${getSheetName()}!1:1`,
  });

  const firstRow = res.data.values?.[0] || [];
  if (firstRow.length === 0) {
    console.log('[Sheets] No headers found — writing column headers to row 1.');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${getSheetName()}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS] },
    });
  }
}

/**
 * Read all existing Business Names from column B (index 1).
 * Returns a Set of lowercased names for fast duplicate checking.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: fullRange(),
  });

  const rows = res.data.values || [];
  const names = new Set();

  // Find the "Business Name" column index from the header row
  const header = rows[0] || [];
  const bizCol = header.findIndex((h) => h === 'Business Name');
  if (bizCol === -1) return names; // No header yet — empty sheet

  // Start at row index 1 to skip the header
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][bizCol];
    if (name) names.add(name.trim().toLowerCase());
  }

  return names;
}

/**
 * Append new leads to the spreadsheet, skipping any whose business name
 * already exists in the sheet.
 *
 * @param {Array} leads - Array of lead objects from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  if (leads.length === 0) {
    console.log('[Sheets] No leads to append.');
    return { added: 0, skipped: 0 };
  }

  const sheets = buildSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  await ensureHeaders(sheets, spreadsheetId);

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId);
  console.log(`[Sheets] ${existingNames.size} existing businesses in sheet.`);

  const today = todayLabel();
  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const nameKey = lead.businessName.trim().toLowerCase();
    if (!nameKey || existingNames.has(nameKey)) {
      if (nameKey) {
        console.log(`[Sheets] Skipping duplicate: ${lead.businessName}`);
      }
      skipped++;
      continue;
    }

    // Build the row in the same order as SHEET_COLUMNS:
    // Date Added | Business Name | Owner First | Owner Last | Phone | City | Website | Called | Notes
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

    existingNames.add(nameKey); // Prevent intra-batch duplicates
  }

  if (newRows.length === 0) {
    console.log('[Sheets] All leads were duplicates — nothing new to add.');
    return { added: 0, skipped };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${getSheetName()}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[Sheets] Appended ${newRows.length} new leads. Skipped ${skipped} duplicates.`);
  return { added: newRows.length, skipped };
}

module.exports = { testConnection, appendLeads };
