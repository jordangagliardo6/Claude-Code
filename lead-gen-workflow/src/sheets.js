/**
 * Google Sheets integration
 *
 * Reads existing entries for duplicate checking and appends new lead rows.
 * Uses a Google Service Account for headless/scheduled access.
 *
 * Column layout (A–I):
 *   A: Date Added     B: Business Name    C: Owner First Name
 *   D: Owner Last     E: Phone Number     F: City
 *   G: Website        H: Called (blank)   I: Notes (blank)
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getAuth() {
  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json'
  );

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      'See setup.js for instructions on creating a service account.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// ─── Header management ────────────────────────────────────────────────────────

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

/**
 * Ensure the first row of the sheet is our header row.
 * If the sheet is brand-new (empty), writes the headers.
 * If headers already exist, does nothing.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:I1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const firstRow = res.data.values?.[0] || [];

  if (firstRow.length === 0) {
    logger.info('Sheets: writing header row');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

// ─── Duplicate checking ───────────────────────────────────────────────────────

/**
 * Returns a Set of lowercase business names already in the spreadsheet.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  // Column B (index 1) is Business Name; read from row 2 onward
  const range = `${sheetName}!B2:B`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];

  const names = new Set();
  rows.forEach(row => {
    const name = row[0]?.trim().toLowerCase();
    if (name) names.add(name);
  });

  logger.info(`Sheets: found ${names.size} existing businesses for duplicate check`);
  return names;
}

// ─── Append rows ──────────────────────────────────────────────────────────────

/**
 * Appends an array of lead objects to the sheet.
 * Each lead must match the schema from apollo.js.
 *
 * @param {Array} leads  Array of { businessName, firstName, lastName, phone, city, website }
 * @returns {number}     Number of rows actually written
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not set in environment');

  const sheetName = process.env.SHEET_NAME || 'Sheet1';
  const sheets = getSheetsClient();

  await ensureHeaders(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);

  // Filter duplicates
  const newLeads = leads.filter(
    lead => !existing.has(lead.businessName.toLowerCase())
  );

  if (newLeads.length === 0) {
    logger.warn('Sheets: all leads are duplicates — nothing to append');
    return 0;
  }

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Build rows in the exact column order defined above
  const rows = newLeads.map(lead => [
    today,              // A: Date Added
    lead.businessName,  // B: Business Name
    lead.firstName,     // C: Owner First Name
    lead.lastName,      // D: Owner Last Name
    lead.phone,         // E: Phone Number
    lead.city,          // F: City
    lead.website,       // G: Website
    '',                 // H: Called (blank)
    '',                 // I: Notes (blank)
  ]);

  const range = `${sheetName}!A:I`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.success(`Sheets: appended ${rows.length} new leads (skipped ${leads.length - newLeads.length} duplicates)`);
  return rows.length;
}

// ─── Connection test ──────────────────────────────────────────────────────────

/**
 * Verify Google Sheets access by reading spreadsheet metadata.
 * Returns the spreadsheet title on success, throws on failure.
 */
async function testConnection() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not set');

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties.title;
}

module.exports = { appendLeads, testConnection };
