const { google } = require('googleapis');
const path = require('path');
const logger = require('./logger');

// ─── Column layout ──────────────────────────────────────────────────────────
// Change column order here if needed — the header row is built from this array.
// 'value' is the key from the lead object (null = user-filled / left blank).
const COLUMNS = [
  { header: 'Date Added',       value: 'dateAdded'    },
  { header: 'Business Name',    value: 'businessName' },
  { header: 'Owner First Name', value: 'firstName'    },
  { header: 'Owner Last Name',  value: 'lastName'     },
  { header: 'Phone Number',     value: 'phone'        },
  { header: 'City',             value: 'city'         },
  { header: 'Website',          value: 'website'      },
  { header: 'Called',           value: null           }, // user fills in
  { header: 'Notes',            value: null           }, // user fills in
];

// Index of the "Business Name" column (0-based) — used for deduplication
const BUSINESS_NAME_COL_INDEX = COLUMNS.findIndex(c => c.value === 'businessName');

/**
 * Build and return an authenticated Google Sheets client.
 */
async function getSheetsClient() {
  const credPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json');

  let auth;
  try {
    auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch (err) {
    throw new Error(`Failed to load Google credentials from ${credPath}: ${err.message}`);
  }

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Ensure the spreadsheet has the correct header row.
 * If the sheet is brand new (empty), writes the header automatically.
 */
async function ensureHeaderRow(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:${columnLetter(COLUMNS.length)}1`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existingRow = resp.data.values?.[0] || [];

  if (existingRow.length === 0) {
    // Sheet is empty — write the header
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS.map(c => c.header)] },
    });
    logger.info('Header row written to sheet.');
  }
}

/**
 * Read all existing Business Names from the sheet for deduplication.
 * @returns {Promise<Set<string>>} lowercase business names already in the sheet
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  // +1 because sheets are 1-indexed; +1 again to skip header
  const col = columnLetter(BUSINESS_NAME_COL_INDEX + 1);
  const range = `${sheetName}!${col}2:${col}10000`; // read up to 10k rows

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = resp.data.values || [];
  return new Set(values.map(row => (row[0] || '').toLowerCase().trim()));
}

/**
 * Append an array of lead objects to the sheet, skipping duplicates.
 * @param {Array} leads - normalized lead objects from apollo.js
 * @returns {Promise<{appended: number, skipped: number}>}
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');

  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  const sheets = await getSheetsClient();

  await ensureHeaderRow(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);
  logger.info(`Sheet currently has ${existing.size} existing business(es).`);

  const today = new Date().toLocaleDateString('en-US'); // MM/DD/YYYY
  const newRows = [];

  for (const lead of leads) {
    const key = (lead.businessName || '').toLowerCase().trim();
    if (!key) {
      logger.warn('Skipping lead with empty business name.');
      continue;
    }
    if (existing.has(key)) {
      logger.info(`Duplicate skipped: "${lead.businessName}"`);
      continue;
    }

    // Build row in the exact column order defined above
    const row = COLUMNS.map(col => {
      if (col.value === 'dateAdded') return today;
      if (col.value === null) return ''; // user-filled columns
      return lead[col.value] || '';
    });

    newRows.push(row);
    existing.add(key); // prevent dupes within this same batch
  }

  if (newRows.length === 0) {
    logger.info('No new leads to append after deduplication.');
    return { appended: 0, skipped: leads.length };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  const skipped = leads.length - newRows.length;
  logger.info(`Appended ${newRows.length} new lead(s). Skipped ${skipped} duplicate(s).`);
  return { appended: newRows.length, skipped };
}

/**
 * Quick connectivity check — verifies credentials and spreadsheet access.
 */
async function testConnection() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const title = meta.data.properties?.title || 'unknown';
  logger.info(`Google Sheets connection OK — spreadsheet: "${title}"`);
  return true;
}

// Convert a 1-based column number to a letter (1→A, 2→B, ... 26→Z, 27→AA)
function columnLetter(n) {
  let letter = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = { appendLeads, testConnection };
