'use strict';

const { google } = require('googleapis');
const logger = require('./logger');

// Column order — must stay in sync with SHEET_HEADERS
// A=0  B=1  C=2  D=3  E=4  F=5  G=6  H=7  I=8
const SHEET_HEADERS = [
  'Date Added',      // A
  'Business Name',   // B  ← deduplication key
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H  (left blank for manual use)
  'Notes',           // I  (left blank for manual use)
];

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Build an authenticated Google Sheets client.
 *
 * Credential priority:
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY_PATH  — path to a JSON key file on disk
 *   2. GOOGLE_SERVICE_ACCOUNT_JSON      — full JSON string as an env var
 *
 * To create a service account:
 *   1. Go to console.cloud.google.com → APIs & Services → Credentials
 *   2. Create a Service Account, download the JSON key
 *   3. Enable the Google Sheets API for your project
 *   4. Share the target spreadsheet with the service account email (Editor role)
 */
async function buildSheetsClient() {
  const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!keyFilePath && !keyJson) {
    throw new Error(
      'No Google credentials configured.\n' +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH (path to JSON key file) or\n' +
      'GOOGLE_SERVICE_ACCOUNT_JSON (JSON string) in your .env file.'
    );
  }

  const authConfig = keyFilePath
    ? { keyFile: keyFilePath }
    : { credentials: JSON.parse(keyJson) };

  const auth = new google.auth.GoogleAuth({
    ...authConfig,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// ── Sheet utilities ───────────────────────────────────────────────────────────

/**
 * Create the header row if the sheet is completely empty.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });
  const firstRow = (res.data.values || [])[0] || [];

  if (firstRow[0] !== 'Date Added') {
    logger.info('Sheet has no headers — adding them now');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_HEADERS] },
    });
  }
}

/**
 * Read all Business Name values from column B (rows 2+).
 * Returns a Set of lowercased, trimmed strings for O(1) lookup.
 */
async function loadExistingNames(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B2:B`,
  });
  const rows = res.data.values || [];
  const names = new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
  logger.info(`Existing entries in sheet: ${names.size}`);
  return names;
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Append new leads to the spreadsheet, skipping duplicates on Business Name.
 * Returns the number of rows actually written.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set in environment');
  }

  logger.info(`Connecting to Google Sheets...`, { spreadsheetId, sheetName });

  const sheets = await buildSheetsClient();

  await ensureHeaders(sheets, spreadsheetId, sheetName);

  const existing = await loadExistingNames(sheets, spreadsheetId, sheetName);

  // Format today's date as MM/DD/YYYY in Eastern Time
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  const skippedDupes = [];

  for (const lead of leads) {
    const key = (lead.businessName || '').toLowerCase().trim();

    if (!key) {
      logger.warn('Skipping lead — no business name', { lead });
      continue;
    }
    if (existing.has(key)) {
      skippedDupes.push(lead.businessName);
      continue;
    }

    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — filled in manually
      '', // Notes  — filled in manually
    ]);

    // Prevent within-run duplicates if Apollo returns the same company twice
    existing.add(key);
  }

  if (skippedDupes.length > 0) {
    logger.info(`Skipped ${skippedDupes.length} duplicate(s)`, { skippedDupes });
  }

  if (newRows.length === 0) {
    logger.info('No new leads to write (all were duplicates)');
    return 0;
  }

  logger.info(`Writing ${newRows.length} new row(s) to sheet...`);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.success(`Wrote ${newRows.length} new lead(s) to "${sheetName}"`);
  return newRows.length;
}

/**
 * Verify the Google Sheets connection.
 * Returns { title, tabs } on success; throws on failure.
 */
async function testConnection() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set');

  const sheets = await buildSheetsClient();

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties.title',
  });

  return {
    title: res.data.properties.title,
    tabs: res.data.sheets.map(s => s.properties.title),
  };
}

module.exports = { appendLeads, testConnection };
