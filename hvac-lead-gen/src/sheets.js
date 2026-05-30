'use strict';

/**
 * Google Sheets client.
 *
 * Uses a service account for authentication — no interactive OAuth prompt.
 * The service account email must be shared as an Editor on the target spreadsheet.
 *
 * Setup guide: https://cloud.google.com/iam/docs/service-accounts-create
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { SHEET_HEADERS } = require('./config');

function getAuth() {
  const credFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || './credentials.json';
  const absPath = path.resolve(credFile);

  if (!fs.existsSync(absPath)) {
    throw new Error(
      `Google credentials file not found at "${absPath}".\n` +
      'Set GOOGLE_SERVICE_ACCOUNT_FILE in .env or place credentials.json in the project root.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(absPath, 'utf8'));

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetTabName() {
  return process.env.GOOGLE_SHEET_TAB_NAME || 'Leads';
}

/**
 * Ensure the header row exists. If the sheet is empty, write the headers first.
 */
async function ensureHeaders(sheets, spreadsheetId, tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:I1`,
  });

  const existing = res.data.values?.[0] ?? [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_HEADERS] },
    });
    console.log(`[Sheets] Header row written to tab "${tab}".`);
  }
}

/**
 * Read all existing business names from column B (index 1).
 * Returns a Set of lowercase trimmed names for O(1) dedup lookups.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Column B, from row 2 downward (skip header)
    range: `${tab}!B2:B`,
  });

  const rows = res.data.values ?? [];
  const names = new Set();
  for (const row of rows) {
    const name = row[0]?.toString().toLowerCase().trim();
    if (name) names.add(name);
  }
  return names;
}

/**
 * Convert a lead object into a sheet row array matching SHEET_HEADERS order.
 * Date Added | Business Name | First | Last | Phone | City | Website | Called | Notes
 */
function buildRow(lead) {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — intentionally blank
    '', // Notes — intentionally blank
  ];
}

/**
 * Append an array of lead objects to the spreadsheet.
 * Returns the number of rows actually written.
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const tab = getSheetTabName();

  await ensureHeaders(sheets, spreadsheetId, tab);

  const rows = leads.map(buildRow);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Read existing business names AND verify connectivity in one call.
 * Used both by the main workflow and by test-connection.js.
 */
async function readExistingNames() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const tab = getSheetTabName();

  await ensureHeaders(sheets, spreadsheetId, tab);
  return getExistingBusinessNames(sheets, spreadsheetId, tab);
}

module.exports = { appendLeads, readExistingNames };
