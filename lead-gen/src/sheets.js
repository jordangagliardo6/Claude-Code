/**
 * Google Sheets integration — reads existing leads, deduplicates, and appends new rows.
 *
 * Auth: service account JSON key pointed to by GOOGLE_CREDENTIALS_PATH.
 * The service account must be shared (with Editor access) on the target spreadsheet.
 *
 * Sheet column layout (must match COLUMNS below):
 *   A: Date Added | B: Business Name | C: Owner First Name | D: Owner Last Name
 *   E: Phone Number | F: City | G: Website | H: Called | I: Notes
 */

const { google }  = require('googleapis');
const path        = require('path');
const fs          = require('fs');
const logger      = require('./logger');

// ─── Column definitions ───────────────────────────────────────────────────────
// Change the order here to reorder the sheet — nothing else needs editing.
const COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank — filled in manually
  'Notes'     // left blank — filled in manually
];

// Column letter of "Business Name" (0-indexed → A=0, B=1 …)
const BUSINESS_NAME_COL_INDEX = COLUMNS.indexOf('Business Name');

// ─── Auth ────────────────────────────────────────────────────────────────────

function getAuthClient() {
  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json'
  );

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      `Set GOOGLE_CREDENTIALS_PATH in your .env file.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

function getSheetConfig() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tabName = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID environment variable is not set.');
  return { sheetId, tabName };
}

// ─── Header management ───────────────────────────────────────────────────────

/**
 * Ensures the first row of the sheet contains the correct headers.
 * Safe to call on every run — does nothing if headers already exist.
 */
async function ensureHeaders(sheets, sheetId, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!1:1`
  });

  const existingHeaders = (res.data.values || [[]])[0] || [];

  if (existingHeaders.length === 0) {
    logger.info('Sheet is empty — writing header row…');
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range:         `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody:   { values: [COLUMNS] }
    });
  } else {
    logger.info(`Header row found: [${existingHeaders.join(', ')}]`);
  }
}

// ─── Duplicate check ─────────────────────────────────────────────────────────

/**
 * Returns a Set of lower-cased business names already in the sheet.
 */
async function getExistingBusinessNames(sheets, sheetId, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:I`
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return new Set(); // only header or empty

  const names = new Set();
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][BUSINESS_NAME_COL_INDEX] || '').trim().toLowerCase();
    if (name) names.add(name);
  }

  logger.info(`Existing sheet entries: ${names.size} businesses`);
  return names;
}

// ─── Row builder ─────────────────────────────────────────────────────────────

function leadToRow(lead) {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: process.env.TIMEZONE || 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });

  // Must match COLUMNS order exactly
  return [
    today,               // Date Added
    lead.businessName,   // Business Name
    lead.firstName,      // Owner First Name
    lead.lastName,       // Owner Last Name
    lead.phone,          // Phone Number
    lead.city,           // City
    lead.website,        // Website
    '',                  // Called  (blank)
    ''                   // Notes   (blank)
  ];
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Appends new leads to the sheet, skipping any business already listed.
 * Returns the count of rows actually written.
 */
async function appendLeads(leads) {
  const sheets = getSheetsClient();
  const { sheetId, tabName } = getSheetConfig();

  await ensureHeaders(sheets, sheetId, tabName);

  const existingNames = await getExistingBusinessNames(sheets, sheetId, tabName);

  const newLeads = leads.filter(l => {
    const key = l.businessName.trim().toLowerCase();
    if (existingNames.has(key)) {
      logger.info(`  Skipping duplicate: "${l.businessName}"`);
      return false;
    }
    return true;
  });

  if (newLeads.length === 0) {
    logger.info('No new leads to append — all were duplicates.');
    return 0;
  }

  const rows = newLeads.map(leadToRow);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range:         `${tabName}!A:I`,
    valueInputOption:       'USER_ENTERED',
    insertDataOption:       'INSERT_ROWS',
    requestBody: { values: rows }
  });

  logger.info(`Appended ${newLeads.length} new lead(s) to "${tabName}" tab.`);
  return newLeads.length;
}

/**
 * Lightweight connectivity check — returns true if the sheet is reachable.
 */
async function testConnection() {
  const sheets = getSheetsClient();
  const { sheetId, tabName } = getSheetConfig();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:A1`
  });

  logger.info(`Google Sheets connection: OK (spreadsheet ID: ${sheetId})`);
  return true;
}

module.exports = { appendLeads, testConnection };
