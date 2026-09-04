/**
 * Google Sheets client
 *
 * Reads existing leads (for duplicate detection) and appends new ones.
 * Uses a service account JSON file for authentication — no OAuth flow needed.
 *
 * Column layout (A–I):
 *   A: Date Added   B: Business Name   C: Owner First Name
 *   D: Owner Last Name   E: Phone Number   F: City
 *   G: Website   H: Called   I: Notes
 *
 * To add or rename columns, update HEADERS and the row builder in appendLeads().
 */

'use strict';

const { google } = require('googleapis');
const path = require('path');

// ─── Column definitions ───────────────────────────────────────────────────────

const HEADERS = [
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

// Spreadsheet range that covers all data columns
const DATA_RANGE = `A:${String.fromCharCode(64 + HEADERS.length)}`; // e.g. A:I

// ─────────────────────────────────────────────────────────────────────────────

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');
  return id;
}

function getSheetTab() {
  return process.env.GOOGLE_SHEET_TAB || 'Leads';
}

/**
 * Build an authenticated Google Sheets client using a service account JSON file.
 */
async function getSheetsClient() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const resolvedPath = path.resolve(credPath);

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Write the header row if the sheet is empty. Safe to call every run.
 */
async function ensureHeaders() {
  const sheets = await getSheetsClient();
  const tab = getSheetTab();
  const id  = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${tab}!A1:${String.fromCharCode(64 + HEADERS.length)}1`,
  });

  const existing = res.data.values?.[0] ?? [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });
    console.log('  Header row written to sheet.');
  }
}

/**
 * Return a Set of normalized (lowercase, trimmed) business names already in the sheet.
 * Used for duplicate detection before appending.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const tab = getSheetTab();
  const id  = getSpreadsheetId();

  // Column B is Business Name
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${tab}!B:B`,
  });

  const rows = res.data.values ?? [];
  // Skip row 1 (header)
  return new Set(
    rows
      .slice(1)
      .map(row => row[0]?.toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Append an array of lead objects to the sheet and return the count added.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {Promise<number>}
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = await getSheetsClient();
  const tab = getSheetTab();
  const id  = getSpreadsheetId();

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day:   '2-digit',
    year:  'numeric',
    timeZone: 'America/New_York',
  });

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank for you to fill in
    '', // Notes  — left blank for you to fill in
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${tab}!${DATA_RANGE}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendLeads };
