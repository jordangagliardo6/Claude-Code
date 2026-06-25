// ─────────────────────────────────────────────────────────────────
// sheets.js — Google Sheets read/write via service account auth.
//
// Auth setup (one-time):
//   1. Create a Google Cloud project at https://console.cloud.google.com
//   2. Enable the Google Sheets API for that project
//   3. Create a Service Account → generate a JSON key
//   4. Save the JSON key as credentials/service-account.json
//   5. Open your Google Sheet → Share → paste the service account email
//      (looks like: name@project-id.iam.gserviceaccount.com) → Editor role
//
// Sheet columns (A–I, defined in config.js):
//   A: Date Added | B: Business Name | C: First Name | D: Last Name
//   E: Phone      | F: City          | G: Website
//   H: Called (blank) | I: Notes (blank)
// ─────────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const path = require('path');
const config = require('./config');

/**
 * Build and return an authenticated Google Sheets API client.
 * Uses the service account JSON key at GOOGLE_SERVICE_ACCOUNT_PATH.
 *
 * @returns {Promise<import('googleapis').sheets_v4.Sheets>}
 */
async function getSheets() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (!keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_PATH is not set in environment variables');
  }

  const resolvedPath = path.isAbsolute(keyPath)
    ? keyPath
    : path.resolve(process.cwd(), keyPath);

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read the Business Name column (column B) from the sheet.
 *
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @returns {Promise<Set<string>>} Lowercased, trimmed business names already in the sheet.
 */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = requireSpreadsheetId();

  const range = `${config.sheetTab}!${config.columns.businessName}:${config.columns.businessName}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values ?? [];

  const names = new Set();
  rows
    .slice(1) // skip the header row
    .forEach((row) => {
      if (row[0]) names.add(row[0].trim().toLowerCase());
    });

  return names;
}

/**
 * Append new leads to the sheet as new rows at the bottom.
 *
 * Each lead becomes one row:
 *   [Date Added, Business Name, First Name, Last Name, Phone, City, Website, '', '']
 *
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {Promise<number>} Number of rows written.
 */
async function appendLeads(sheets, leads) {
  const spreadsheetId = requireSpreadsheetId();
  const today = formatDate(new Date());

  const rows = leads.map((lead) => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — fill in manually after you call them
    '', // Notes — fill in manually
  ]);

  const firstCol = config.columns.dateAdded;
  const lastCol  = config.columns.notes;
  const range    = `${config.sheetTab}!${firstCol}:${lastCol}`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ── Helpers ───────────────────────────────────────────────────────

function requireSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set in environment variables');
  return id;
}

function formatDate(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  return `${m}/${d}/${y}`; // e.g. "6/25/2026"
}

module.exports = { getSheets, getExistingBusinessNames, appendLeads };
