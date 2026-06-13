'use strict';
require('dotenv').config();
const { google } = require('googleapis');
const config = require('./config');
const log = require('./logger');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TAB = config.sheetTabName;

// Returns an authenticated Google Sheets client using a service account.
async function getClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/service-account.json';
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Ensures the header row exists; writes it if the sheet is empty.
async function ensureHeader(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1:Z1`,
  });

  const existing = res.data.values?.[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.columns] },
    });
    log.info('Header row written to sheet.');
  }
}

// Returns a Set of business names already present in column B (lowercase, trimmed).
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    // Column B = Business Name; skip row 1 (header)
    range: `${TAB}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
}

// Appends new leads to the sheet, skipping any whose business name already exists.
// Returns { added, skipped } counts.
async function appendLeads(leads) {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID environment variable is not set.');

  const sheets = await getClient();
  await ensureHeader(sheets);

  const existing = await getExistingBusinessNames(sheets);
  log.info(`Sheet currently has ${existing.size} existing businesses.`);

  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key || existing.has(key)) {
      log.warn(`Skipping duplicate: "${lead.businessName}"`);
      skipped++;
      continue;
    }

    // Columns: Date Added | Business Name | First | Last | Phone | City | Website | Called | Notes
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — left blank
      '', // Notes  — left blank
    ]);
    existing.add(key); // prevent duplicates within the same batch
  }

  if (newRows.length === 0) {
    log.info('No new leads to add — all results are duplicates or already in the sheet.');
    return { added: 0, skipped };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return { added: newRows.length, skipped };
}

// Lightweight connection test — reads only the first row.
async function testConnection() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID environment variable is not set.');
  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1:I1`,
  });
  return res.data;
}

module.exports = { appendLeads, testConnection };
