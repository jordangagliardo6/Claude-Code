/**
 * sheets.js — Google Sheets read/write
 *
 * Authentication: Google Service Account (JSON key file).
 * The service account email must be shared as an Editor on your spreadsheet.
 *
 * Column layout (A–I):
 *   Date Added | Business Name | Owner First Name | Owner Last Name |
 *   Phone Number | City | Website | Called | Notes
 *
 * To change column order, update COLUMN_HEADERS and the row-builder in appendLeads().
 */

'use strict';

const path = require('path');
const { google } = require('googleapis');

// ── Column definitions ────────────────────────────────────────────────────────
// Change order here if you want a different spreadsheet layout.
const COLUMN_HEADERS = [
  'Date Added',       // A
  'Business Name',    // B  ← dedup key
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank for you to fill in)
  'Notes',            // I  (left blank for you to fill in)
];

// Business Name is column B (index 1, 0-based) — used for dedup
const BUSINESS_NAME_COL = 'B';

function getSheetTab() {
  return process.env.SHEET_TAB_NAME || 'Leads';
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function buildAuth() {
  const keyFile = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE || './google-credentials.json'
  );
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: buildAuth() });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Write the header row if row 1 is blank or has the wrong first cell.
 * Safe to call on every run — it no-ops if headers already exist.
 */
async function ensureHeaders(sheets, spreadsheetId) {
  const tab  = getSheetTab();
  const cols = String.fromCharCode(64 + COLUMN_HEADERS.length); // A→I etc.
  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:${cols}1`,
  });

  const firstCell = res.data.values?.[0]?.[0] ?? '';
  if (firstCell === COLUMN_HEADERS[0]) return; // already there

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range           : `${tab}!A1:${cols}1`,
    valueInputOption: 'RAW',
    requestBody     : { values: [COLUMN_HEADERS] },
  });
  console.log('  Header row written to spreadsheet.');
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Return all business names already in the sheet (column B, rows 2+).
 * Used by index.js to filter out duplicates before inserting.
 */
async function getExistingNames(spreadsheetId) {
  const sheets = getSheetsClient();
  const tab    = getSheetTab();

  await ensureHeaders(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!${BUSINESS_NAME_COL}2:${BUSINESS_NAME_COL}`,
  });

  return (res.data.values || []).map(row => row[0] || '').filter(Boolean);
}

/**
 * Append an array of lead objects as new rows.
 *
 * @param {string} spreadsheetId
 * @param {Array}  leads  — each must have: businessName, firstName, lastName,
 *                          phone, city, website
 */
async function appendLeads(spreadsheetId, leads) {
  const sheets = getSheetsClient();
  const tab    = getSheetTab();
  const cols   = String.fromCharCode(64 + COLUMN_HEADERS.length);

  // Eastern-time date label (e.g. "07/07/2026")
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year    : 'numeric',
    month   : '2-digit',
    day     : '2-digit',
  });

  const rows = leads.map(lead => [
    today,             // A — Date Added
    lead.businessName, // B — Business Name
    lead.firstName,    // C — Owner First Name
    lead.lastName,     // D — Owner Last Name
    lead.phone,        // E — Phone Number
    lead.city,         // F — City
    lead.website,      // G — Website
    '',                // H — Called (intentionally blank)
    '',                // I — Notes  (intentionally blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range           : `${tab}!A:${cols}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody     : { values: rows },
  });
}

/**
 * Quick connectivity check — reads a single cell without modifying anything.
 * Throws if the credentials or spreadsheet ID are wrong.
 */
async function verifyConnection(spreadsheetId) {
  const sheets = getSheetsClient();
  const tab    = getSheetTab();
  await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1`,
  });
}

module.exports = { getExistingNames, appendLeads, verifyConnection };
