/**
 * sheets.js — Google Sheets API client
 *
 * Handles auth, header setup, duplicate detection, and row appending.
 * Uses a Google Service Account (no browser OAuth flow needed for automation).
 *
 * Setup guide: https://developers.google.com/sheets/api/quickstart/nodejs
 */

'use strict';

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ─── Column layout (zero-indexed A=0, B=1 …) ─────────────────────────────────
// Edit COLUMN_HEADERS to add/remove/rename columns. The order here is the
// order they appear in the spreadsheet.
const COLUMN_HEADERS = [
  'Date Added',      // A
  'Business Name',   // B  ← used for dedup
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H  (left blank)
  'Notes',           // I  (left blank)
];

// Column index (0-based) of the Business Name field — used for dedup reads
const BUSINESS_NAME_COL_INDEX = 1; // B

// ─── Auth ─────────────────────────────────────────────────────────────────────

let _sheetsClient = null;

async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const auth = await buildAuth();
  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

async function buildAuth() {
  const jsonPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  // Option A: JSON key file on disk
  if (jsonPath) {
    const resolved = path.resolve(process.cwd(), jsonPath);
    if (fs.existsSync(resolved)) {
      return new google.auth.GoogleAuth({
        keyFile: resolved,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
    throw new Error(`Google service account JSON not found at: ${resolved}`);
  }

  // Option B: Inline credentials from environment variables
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      'Google credentials missing. Set GOOGLE_SERVICE_ACCOUNT_JSON (file path) ' +
      'or both GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.'
    );
  }

  // Environment variables encode newlines as literal \n — unescape them
  const privateKey = rawKey.replace(/\\n/g, '\n');

  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function spreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID environment variable is not set.');
  return id;
}

function sheetName() {
  return process.env.SHEET_TAB_NAME || 'Sheet1';
}

function range(cols) {
  return `${sheetName()}!${cols}`;
}

/** A1 notation for the full header range (e.g. "Sheet1!A1:I1") */
function headerRange() {
  const lastCol = String.fromCharCode(64 + COLUMN_HEADERS.length); // A=65
  return range(`A1:${lastCol}1`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verify connection and return spreadsheet metadata.
 * Called by setup-check.js to confirm credentials work before the first run.
 */
async function testConnection() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId() });
  return {
    title: res.data.properties?.title,
    sheets: res.data.sheets?.map(s => s.properties?.title),
  };
}

/**
 * Write column headers to row 1 if the sheet is empty.
 * Safe to call on every run — does nothing if headers already exist.
 */
async function ensureHeaders() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: headerRange(),
  });

  const existing = res.data.values?.[0];
  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: headerRange(),
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMN_HEADERS] },
    });
    console.log('  Headers written to spreadsheet.');
  }
}

/**
 * Read the Business Name column (B) and return a lowercase Set for O(1) dedup.
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();

  const colLetter = String.fromCharCode(65 + BUSINESS_NAME_COL_INDEX); // B
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: range(`${colLetter}2:${colLetter}`), // skip header row
  });

  const values = res.data.values ?? [];
  return new Set(values.flat().map(v => v.toLowerCase().trim()));
}

/**
 * Append an array of lead objects as new rows.
 * Returns the number of rows successfully written.
 *
 * @param {Array<{ businessName, firstName, lastName, phone, city, website }>} leads
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = await getSheetsClient();

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const rows = leads.map(lead => [
    today,             // A: Date Added
    lead.businessName, // B: Business Name
    lead.firstName,    // C: Owner First Name
    lead.lastName,     // D: Owner Last Name
    lead.phone,        // E: Phone Number
    lead.city,         // F: City
    lead.website,      // G: Website
    '',                // H: Called  (intentionally blank)
    '',                // I: Notes   (intentionally blank)
  ]);

  const lastCol = String.fromCharCode(64 + COLUMN_HEADERS.length);

  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: range(`A:${lastCol}`),
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = {
  testConnection,
  ensureHeaders,
  getExistingBusinessNames,
  appendLeads,
  COLUMN_HEADERS,
};
