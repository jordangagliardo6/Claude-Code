'use strict';

const fs          = require('fs');
const { google }  = require('googleapis');
const config      = require('./config');
const logger      = require('./logger');

// ─── Auth ─────────────────────────────────────────────────────────────────────

function buildAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './credentials/service-account.json';

  // Option A: key file on disk
  if (fs.existsSync(keyFile)) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // Option B: credentials in environment variables (useful for cloud deployments)
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key:  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  throw new Error(
    'Google credentials not found.\n' +
    '  • Place service-account.json in ./credentials/  OR\n' +
    '  • Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env'
  );
}

function getSheetsClient() {
  const auth = buildAuth();
  return google.sheets({ version: 'v4', auth });
}

// ─── Sheet range helper ───────────────────────────────────────────────────────

function fullRange(col) {
  return `${config.SHEET_NAME}!${col}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verifies we can read the spreadsheet and that it has the expected header row.
 * If the sheet is brand-new (empty A1), we write the header row automatically.
 */
async function testConnection() {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: fullRange('A1:I1'),
  });

  const firstRow = res.data.values?.[0] || [];

  if (firstRow.length === 0) {
    // Sheet is empty — write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: fullRange('A1'),
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [config.COLUMN_HEADERS] },
    });
    logger.info('Google Sheets: header row written automatically.');
  } else {
    logger.info(`Google Sheets: found existing header row → ${firstRow.join(' | ')}`);
  }

  return true;
}

/**
 * Returns a Set of existing business names (lowercased) for fast duplicate lookups.
 */
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    // Column B is Business Name (index 1); skip row 1 header
    range: fullRange('B2:B'),
  });

  const names = new Set();
  for (const row of (res.data.values || [])) {
    const name = (row[0] || '').trim().toLowerCase();
    if (name) names.add(name);
  }
  logger.info(`Google Sheets: ${names.size} existing business name(s) loaded for dedup.`);
  return names;
}

/**
 * Appends an array of lead objects as new rows at the bottom of the sheet.
 *
 * @param {Array} leads  - shaped by apollo.js parsePerson
 * @returns {number}     - rows written
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets  = getSheetsClient();
  const today   = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  // Build each row in column order defined by config.COLUMNS
  const rows = leads.map((lead) => {
    const row = new Array(config.COLUMN_HEADERS.length).fill('');
    row[config.COLUMNS.DATE_ADDED]    = today;
    row[config.COLUMNS.BUSINESS_NAME] = lead.businessName;
    row[config.COLUMNS.FIRST_NAME]    = lead.firstName;
    row[config.COLUMNS.LAST_NAME]     = lead.lastName;
    row[config.COLUMNS.PHONE]         = lead.phone;
    row[config.COLUMNS.CITY]          = lead.city;
    row[config.COLUMNS.WEBSITE]       = lead.website;
    // CALLED and NOTES intentionally left blank
    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId:   process.env.GOOGLE_SPREADSHEET_ID,
    range:           fullRange('A:I'),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

module.exports = { testConnection, getExistingBusinessNames, appendLeads };
