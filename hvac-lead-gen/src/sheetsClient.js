/**
 * Google Sheets client
 *
 * Reads existing leads (for duplicate detection) and appends new rows.
 * Uses a Service Account so no browser OAuth flow is needed for automation.
 *
 * Required Google Cloud setup:
 *   1. Enable "Google Sheets API" in your project
 *   2. Create a Service Account → download JSON key
 *   3. Share your spreadsheet with the service account email (editor access)
 *   4. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH and GOOGLE_SPREADSHEET_ID in .env
 */

const { google } = require('googleapis');
const path = require('path');
const logger = require('./logger');

// Column order matches the sheet header exactly
const COLUMNS = [
  'Date Added',      // A
  'Business Name',   // B
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H — left blank for manual use
  'Notes',           // I — left blank for manual use
];

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set in environment');
  }

  const resolvedPath = path.resolve(keyPath);
  const key = require(resolvedPath); // eslint-disable-line

  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

function sheetRange(extraRange = '') {
  const name = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  return extraRange ? `'${name}'!${extraRange}` : `'${name}'`;
}

// ─── Header bootstrap ─────────────────────────────────────────────────────────

/**
 * Ensures the header row exists. Safe to call on every run.
 */
async function ensureHeader(sheets, spreadsheetId) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange('A1:I1'),
  });

  const existing = result.data.values?.[0] ?? [];
  if (existing.length === 0) {
    logger.info('Sheet is empty — writing header row');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetRange('A1'),
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
  }
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

/**
 * Returns a Set of lowercase business names already in the sheet.
 * Reads only column B (Business Name) for efficiency.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange('B2:B'),  // skip header row
  });

  const names = new Set(
    (result.data.values ?? [])
      .flat()
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean)
  );

  logger.info(`Found ${names.size} existing businesses in sheet`);
  return names;
}

// ─── Append ───────────────────────────────────────────────────────────────────

/**
 * Appends new lead rows to the sheet.
 *
 * @param {Array} leads  Normalized lead objects from apolloClient
 * @returns {number}     Number of rows actually written
 */
async function appendLeads(leads) {
  if (leads.length === 0) {
    logger.info('No leads to append');
    return 0;
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set in environment');

  const auth = getAuth();
  const sheets = getSheetsClient(auth);

  await ensureHeader(sheets, spreadsheetId);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  // Filter duplicates and map to row arrays
  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (existing.has(key)) {
      skipped.push(lead.businessName);
      continue;
    }
    existing.add(key); // prevent intra-batch duplicates
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — blank
      '', // Notes  — blank
    ]);
  }

  if (skipped.length > 0) {
    logger.info(`Skipped ${skipped.length} duplicate(s): ${skipped.join(', ')}`);
  }

  if (newRows.length === 0) {
    logger.info('All leads were duplicates — nothing appended');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetRange('A:I'),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.success(`Appended ${newRows.length} new lead(s) to Google Sheet`);
  return newRows.length;
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnection() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set in environment');

  const auth = getAuth();
  const sheets = getSheetsClient(auth);

  const result = await sheets.spreadsheets.get({ spreadsheetId });
  return result.data.properties?.title || 'Connected';
}

module.exports = { appendLeads, testConnection, COLUMNS };
