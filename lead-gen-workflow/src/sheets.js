/**
 * Google Sheets integration — reads existing rows for deduplication
 * and appends new leads.
 *
 * Authentication: Google service account (recommended for scheduled automation).
 * Point GOOGLE_APPLICATION_CREDENTIALS at your downloaded service account JSON.
 *
 * To change the spreadsheet column order, update HEADER_ROW and LEAD_TO_ROW below.
 */

const { google } = require('googleapis');
const logger = require('./logger');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Columns in the order they appear in the sheet — edit here if you add/remove columns.
const HEADER_ROW = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',  // left blank for manual use
  'Notes',   // left blank for manual use
];

// Maps a lead object to a row array that matches HEADER_ROW.
function leadToRow(lead, dateStr) {
  return [
    dateStr,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called
    '', // Notes
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

function buildAuth() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set');
  return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
}

/**
 * Write the header row if the sheet is empty.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });
  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    logger.info('Header row written to sheet');
  }
}

/**
 * Read all values in the Business Name column (B) and return a lowercase Set.
 * Used to skip duplicates on insert.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B2:B`, // B2 onwards — skips the header
  });
  const rows = res.data.values ?? [];
  const names = new Set(rows.map((r) => (r[0] ?? '').toLowerCase().trim()));
  logger.info(`Sheet already contains ${names.size} businesses`);
  return names;
}

/**
 * Append new leads to the spreadsheet, skipping any whose Business Name
 * already appears in column B.
 *
 * @param {string} spreadsheetId  - Google Sheets file ID
 * @param {object[]} leads        - Normalized lead objects from apollo.js
 * @param {string} sheetName      - Tab name (default: Sheet1)
 * @returns {number}              - Count of rows actually inserted
 */
async function appendLeads(spreadsheetId, leads, sheetName = 'Sheet1') {
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets, spreadsheetId, sheetName);
  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day:   '2-digit',
    year:  'numeric',
  });

  const newRows = [];
  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key) {
      logger.warn(`Skipping lead with blank business name: ${lead.firstName} ${lead.lastName}`);
      continue;
    }
    if (existing.has(key)) {
      logger.info(`Duplicate skipped: ${lead.businessName}`);
      continue;
    }
    newRows.push(leadToRow(lead, today));
    existing.add(key); // prevent duplicates within the same run
  }

  if (newRows.length === 0) {
    logger.info('No new rows to append — all leads were duplicates or had no business name');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.info(`Appended ${newRows.length} new lead(s) to the sheet`);
  return newRows.length;
}

module.exports = { appendLeads };
