const { google } = require('googleapis');
const path = require('path');
const logger = require('./logger');

// ── Column layout ─────────────────────────────────────────────────────────────
// If you need to add/remove columns, update HEADERS and the buildRow function.
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

// Column index (0-based) used to check for duplicates
const BUSINESS_NAME_COL = 1; // Column B

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAuthClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set.');

  const resolvedPath = path.resolve(process.cwd(), keyPath);
  const key = require(resolvedPath);

  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function getSheetRange(tab, colRange = 'A:I') {
  return `'${tab}'!${colRange}`;
}

function buildRow(lead, dateStr) {
  return [
    dateStr,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank
    '', // Notes — left blank
  ];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ensures the header row exists. If the sheet is empty, writes the header.
 */
async function ensureHeaders(sheets, spreadsheetId, tab) {
  const range = getSheetRange(tab, 'A1:I1');
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = res.data.values || [];

  if (existing.length === 0) {
    logger.info('Sheet is empty — writing header row.');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

/**
 * Reads all existing business names from the sheet (column B).
 * Returns a Set of lowercased names for fast duplicate lookup.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, tab) {
  const range = getSheetRange(tab, 'B:B');
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];

  const names = new Set();
  for (let i = 1; i < rows.length; i++) {
    // Skip header row (index 0)
    const name = (rows[i][0] || '').trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

/**
 * Appends an array of lead rows to the sheet.
 */
async function appendRows(sheets, spreadsheetId, tab, rows) {
  const range = getSheetRange(tab, 'A:I');
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Main entry point: deduplicates `leads` against the sheet, then appends new ones.
 * Returns the number of leads actually written.
 */
async function writeLeadsToSheet(leads) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const tab = process.env.SHEET_TAB_NAME || 'Sheet1';

  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set.');

  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets, spreadsheetId, tab);

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId, tab);
  logger.info(`Sheet currently has ${existingNames.size} existing business entries.`);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  const newRows = [];
  for (const lead of leads) {
    const normalized = lead.businessName.trim().toLowerCase();
    if (existingNames.has(normalized)) {
      logger.info(`  Duplicate skipped: ${lead.businessName}`);
    } else {
      newRows.push(buildRow(lead, today));
      existingNames.add(normalized); // Prevent dupes within the same batch
      logger.info(`  Queued: ${lead.businessName} | ${lead.firstName} ${lead.lastName} | ${lead.phone}`);
    }
  }

  if (newRows.length === 0) {
    logger.warn('All fetched leads were duplicates — nothing written to sheet.');
    return 0;
  }

  await appendRows(sheets, spreadsheetId, tab, newRows);
  return newRows.length;
}

/**
 * Connectivity test — reads the spreadsheet title to confirm auth works.
 */
async function testConnection() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties.title;
}

module.exports = { writeLeadsToSheet, testConnection };
