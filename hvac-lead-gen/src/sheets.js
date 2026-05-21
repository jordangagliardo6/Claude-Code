/**
 * Google Sheets client
 *
 * Supports two auth modes (configure via .env):
 *   A) Service account  → set GOOGLE_SERVICE_ACCOUNT_JSON
 *   B) OAuth2           → set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
 */

const { google } = require('googleapis');
const config     = require('./config');
const logger     = require('./logger');

// ── Auth ───────────────────────────────────────────────────────────────────

async function buildAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  if (
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  ) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return oauth2;
  }

  throw new Error(
    'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON or ' +
    '(GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN) in your .env file.'
  );
}

async function getSheetsClient() {
  const auth = await buildAuth();
  return google.sheets({ version: 'v4', auth });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');
  return id;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || 'Leads';
}

/** Convert 1-based column number to letter: 1→A, 27→AA */
function colLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ── Sheet operations ───────────────────────────────────────────────────────

/**
 * Write the header row if the sheet is currently empty.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const lastCol = colLetter(config.sheetColumns.length);
  const range   = `${sheetName}!A1:${lastCol}1`;

  const res      = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = (res.data.values || [])[0] || [];

  if (existing.length === 0) {
    logger.info('Sheet is empty — writing header row');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody:      { values: [config.sheetColumns] },
    });
  }
}

/**
 * Return a Set of lowercased business names already in column B.
 * Used for fast O(1) dedup checks.
 */
async function getExistingNames(sheets, spreadsheetId, sheetName) {
  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.map(row => (row[0] || '').trim().toLowerCase()));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Append leads to the Google Sheet, skipping duplicates.
 *
 * @param {Array} leads   Normalized lead objects from apollo.js
 * @returns {number}      Count of rows actually written
 */
async function appendLeads(leads) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName     = getSheetName();

  const sheets = await getSheetsClient();
  await ensureHeaders(sheets, spreadsheetId, sheetName);

  const existingNames = await getExistingNames(sheets, spreadsheetId, sheetName);
  logger.info(`Dedup check: ${existingNames.size} businesses already in sheet`);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  });

  const newRows = [];

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();

    if (!key) {
      logger.warn('Skipping lead with no business name', { lead });
      continue;
    }

    if (existingNames.has(key)) {
      logger.info(`Skipping duplicate: "${lead.businessName}"`);
      continue;
    }

    // Row order must match config.sheetColumns exactly:
    // Date Added | Business Name | First Name | Last Name |
    // Phone | City | Website | Called (blank) | Notes (blank)
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',  // Called — you fill this in
      '',  // Notes  — you fill this in
    ]);

    // Prevent within-batch duplicates when Apollo returns the same biz twice
    existingNames.add(key);
  }

  if (newRows.length === 0) {
    logger.info('Nothing to write — all leads were duplicates or missing business name');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:            `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: newRows },
  });

  logger.success(`Wrote ${newRows.length} new rows to sheet "${sheetName}"`);
  return newRows.length;
}

/**
 * Verify credentials and spreadsheet access.
 */
async function verifyConnection() {
  const spreadsheetId = getSpreadsheetId();
  const sheets        = await getSheetsClient();

  const res = await sheets.spreadsheets.get({ spreadsheetId });

  return {
    connected:  true,
    title:      res.data.properties?.title || 'unknown',
    sheetNames: res.data.sheets?.map(s => s.properties.title) || [],
  };
}

module.exports = { appendLeads, verifyConnection };
