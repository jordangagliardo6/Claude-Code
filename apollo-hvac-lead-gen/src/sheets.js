'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { SPREADSHEET_COLUMNS, SHEET_TAB } = require('./config');

// Column B (index 1 in the row array) holds "Business Name" —
// this is the field we deduplicate on.
const BUSINESS_NAME_COL_LETTER = 'B';

// ─── Auth ─────────────────────────────────────────────────────────────────────

function buildAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH environment variable is not set');
  }

  const resolved = path.resolve(keyPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account key file not found: ${resolved}`);
  }

  return new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function sheetsClient() {
  return google.sheets({ version: 'v4', auth: buildAuth() });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Make sure the first row of the sheet contains the expected column headers.
 * Safe to call on every run — won't overwrite if headers are already correct.
 */
async function ensureHeaders(spreadsheetId) {
  const client = sheetsClient();
  const range = `${SHEET_TAB}!A1:${columnLetter(SPREADSHEET_COLUMNS.length)}1`;

  const res = await client.spreadsheets.values.get({ spreadsheetId, range }).catch((err) => {
    throwSheetError(err, spreadsheetId);
  });

  const firstRow = res.data.values?.[0] ?? [];

  if (firstRow[0] !== SPREADSHEET_COLUMNS[0]) {
    await client.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [SPREADSHEET_COLUMNS] },
    });
    console.log('  Header row written to spreadsheet.');
  }
}

/**
 * Return a Set of lowercase-trimmed business names already in the sheet.
 * Used for fast duplicate detection before writing.
 */
async function fetchExistingNames(spreadsheetId) {
  const client = sheetsClient();

  const res = await client.spreadsheets.values
    .get({
      spreadsheetId,
      range: `${SHEET_TAB}!${BUSINESS_NAME_COL_LETTER}:${BUSINESS_NAME_COL_LETTER}`,
    })
    .catch((err) => throwSheetError(err, spreadsheetId));

  const rows = res.data.values ?? [];
  // rows[0] is the header ("Business Name") — skip it
  return new Set(
    rows
      .slice(1)
      .map((row) => (row[0] ?? '').toLowerCase().trim())
      .filter(Boolean),
  );
}

/**
 * Append new lead rows to the sheet.
 * Returns the number of rows actually written.
 */
async function appendLeads(spreadsheetId, leads) {
  if (leads.length === 0) return 0;

  const client = sheetsClient();
  const today = todayET();

  // Row order must match SPREADSHEET_COLUMNS exactly:
  // Date Added | Business Name | First Name | Last Name | Phone | City | Website | Called | Notes
  const rows = leads.map((lead) => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — intentionally blank
    '', // Notes  — intentionally blank
  ]);

  await client.spreadsheets.values
    .append({
      spreadsheetId,
      range: `${SHEET_TAB}!A:${columnLetter(SPREADSHEET_COLUMNS.length)}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    })
    .catch((err) => throwSheetError(err, spreadsheetId));

  return rows.length;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// Convert a 1-based column index to a letter (1→A, 2→B, …, 26→Z).
function columnLetter(n) {
  return String.fromCharCode(64 + n);
}

function todayET() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });
}

function throwSheetError(err, spreadsheetId) {
  if (err.code === 404 || err.status === 404) {
    throw new Error(
      `Spreadsheet not found (ID: ${spreadsheetId}). ` +
        'Double-check GOOGLE_SPREADSHEET_ID and that the sheet is shared with the service account.',
    );
  }
  if (err.code === 403 || err.status === 403) {
    throw new Error(
      'Permission denied on the spreadsheet. ' +
        'Make sure you shared it with the service account email (Editor access).',
    );
  }
  throw err;
}

module.exports = { ensureHeaders, fetchExistingNames, appendLeads };
