/**
 * Google Sheets API client
 * Handles reading existing data (for duplicate detection) and appending new leads.
 *
 * Uses a Google Service Account JSON key for authentication (no browser OAuth needed).
 * The service account email must be added as an Editor on your spreadsheet.
 *
 * To change column order: edit COLUMNS below and update the row builder in appendLeads().
 */

'use strict';

const { google } = require('googleapis');
const path = require('path');

// ─── Column definition — easy to modify ──────────────────────────────────────

const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B  ← duplicate check is performed against this column
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank — filled manually)
  'Notes',            // I  (left blank — filled manually)
];

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getCredentialsPath() {
  return (
    process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, '..', 'credentials', 'google-credentials.json')
  );
}

async function buildSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: getCredentialsPath(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || 'Sheet1';
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  return id;
}

function todayET() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// ─── Core operations ──────────────────────────────────────────────────────────

/**
 * Ensures the header row exists in the sheet. Safe to call on every run.
 */
async function ensureHeaderRow(sheets) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:${String.fromCharCode(64 + COLUMNS.length)}1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('  Header row created.');
  }
}

/**
 * Returns a Set of existing business names (lowercase) for O(1) duplicate lookup.
 */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`, // Business Name column
  });

  const rows = res.data.values || [];
  // Skip header row (index 0), collect all non-empty business names
  const names = rows
    .slice(1)
    .map((r) => (r[0] || '').toLowerCase().trim())
    .filter(Boolean);

  return new Set(names);
}

/**
 * Converts a lead object into a spreadsheet row array matching COLUMNS order.
 */
function leadToRow(lead, dateStr) {
  return [
    dateStr,              // Date Added
    lead.businessName,    // Business Name
    lead.firstName,       // Owner First Name
    lead.lastName,        // Owner Last Name
    lead.phone,           // Phone Number
    lead.city,            // City
    lead.website,         // Website
    '',                   // Called — blank
    '',                   // Notes — blank
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Appends new leads to the spreadsheet, skipping duplicates.
 * @param {Array} leads - Array of formatted lead objects from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  const sheets = await buildSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  await ensureHeaderRow(sheets);
  const existing = await getExistingBusinessNames(sheets);

  const today = todayET();

  const newLeads = leads.filter((lead) => {
    const normalized = (lead.businessName || '').toLowerCase().trim();
    return normalized && !existing.has(normalized);
  });

  const skipped = leads.length - newLeads.length;

  if (newLeads.length === 0) {
    return { added: 0, skipped };
  }

  const rows = newLeads.map((lead) => leadToRow(lead, today));

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:${String.fromCharCode(64 + COLUMNS.length)}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return { added: newLeads.length, skipped };
}

/**
 * Verifies the Google Sheets connection and returns the spreadsheet title.
 */
async function testConnection() {
  const sheets = await buildSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
  return res.data.properties.title;
}

module.exports = { appendLeads, testConnection };
