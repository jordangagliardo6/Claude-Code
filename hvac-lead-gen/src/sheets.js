/**
 * sheets.js — Google Sheets API client.
 * Handles reading existing leads (for dedup) and appending new rows.
 *
 * Auth: uses a Google Service Account. Either point GOOGLE_CREDENTIALS_PATH
 * at your downloaded JSON key file, or set GOOGLE_CREDENTIALS_JSON to the
 * raw JSON string (useful for server deployments without a filesystem).
 */

const { google } = require('googleapis');
const path = require('path');
const config = require('./config');

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set in environment variables.');
  return id;
}

// Build an authenticated GoogleAuth client from env variables.
// Supports two auth methods (in priority order):
//   1. GOOGLE_CREDENTIALS_JSON — raw or base64-encoded service account JSON
//   2. GOOGLE_CREDENTIALS_PATH — path to the service account JSON file
function buildAuth() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
  const rawJson = process.env.GOOGLE_CREDENTIALS_JSON;

  if (rawJson) {
    let parsed;
    try {
      // Accept both plain JSON and base64-encoded JSON
      const text = rawJson.trimStart().startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        'GOOGLE_CREDENTIALS_JSON is not valid JSON or base64-encoded JSON. ' +
        'Re-export your service account key and try again.'
      );
    }
    return new google.auth.GoogleAuth({ credentials: parsed, scopes });
  }

  // Fall back to file-based credentials
  const keyFile = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'
  );
  return new google.auth.GoogleAuth({ keyFile, scopes });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: buildAuth() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

// Verify connectivity and return basic spreadsheet info.
async function testSheetsConnection() {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const existing = await getExistingBusinessNames();

  return {
    title: meta.data.properties.title,
    existingLeads: existing.size,
  };
}

// Return a Set of normalized business names already in the sheet.
// Used for O(1) duplicate checks — matches case-insensitively.
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const range = `${config.sheetTabName}!B:B`; // Business Name column

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range,
  });

  return new Set(
    (res.data.values || [])
      .flat()
      .map(v => v.trim().toLowerCase())
      .filter(v => v && v !== 'business name') // skip header row
  );
}

// Write the header row if the sheet is empty or missing headers.
async function ensureHeaderRow() {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${config.sheetTabName}!A1:Z1`,
  });

  const firstRow = (res.data.values || [[]])[0] || [];
  if (firstRow[0] === config.columnHeaders[0]) return; // headers already present

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${config.sheetTabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [config.columnHeaders] },
  });

  console.log('  Header row written to spreadsheet.');
}

// Append an array of lead objects as new rows in the sheet.
// Returns the count of rows appended.
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = getSheetsClient();

  // Map each lead to an ordered array matching columnHeaders
  const rows = leads.map(lead => [
    lead.dateAdded,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phoneNumber,
    lead.city,
    lead.website,
    '', // Called — left blank for manual tracking
    '', // Notes  — left blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${config.sheetTabName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { testSheetsConnection, getExistingBusinessNames, appendLeads, ensureHeaderRow };
