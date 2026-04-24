'use strict';
const { google } = require('googleapis');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

// ─── AUTH ─────────────────────────────────────────────────────────────────────

// We use a Service Account (not user OAuth) because this workflow runs headless
// on a schedule. You never need to click "Authorize" again once the sheet is
// shared with the service account email.
function getAuthClient() {
  const keyFile = path.isAbsolute(config.googleServiceAccountKeyFile)
    ? config.googleServiceAccountKeyFile
    : path.join(__dirname, '..', config.googleServiceAccountKeyFile);

  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

// ─── HEADER MANAGEMENT ───────────────────────────────────────────────────────

// Writes the column headers on row 1 only if the sheet is currently empty.
// This makes first-run setup automatic — you don't need to pre-format the sheet.
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A1:Z1`,
  });

  const existingHeaders = (res.data.values || [])[0] || [];
  if (existingHeaders.length > 0) {
    logger.info('Sheet headers already present, skipping write');
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [config.sheetColumns] },
  });

  logger.info('Sheet headers written', { columns: config.sheetColumns });
}

// ─── DUPLICATE DETECTION ─────────────────────────────────────────────────────

// Reads all values in column B (Business Name) and returns them as a
// case-insensitive Set for O(1) lookup during the dedup check.
// Column B is the Business Name column per the SHEET_COLUMNS definition.
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    // A:A is Date Added, B:B is Business Name — skip row 1 (header) via slicing caller-side.
    range: `${config.sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  const names = new Set(rows.map((r) => (r[0] || '').trim().toLowerCase()));
  logger.info(`Found ${names.size} existing business names in sheet`);
  return names;
}

// ─── ROW APPEND ──────────────────────────────────────────────────────────────

// Appends rows at the first empty row after existing data.
// Using APPEND (not UPDATE) means we never overwrite existing rows.
async function appendRows(sheets, rows) {
  if (!rows.length) {
    logger.info('No rows to append');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',  // lets Google parse dates and URLs
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.success(`Appended ${rows.length} new rows to sheet`);
  return rows.length;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

// Writes an array of lead objects to the spreadsheet.
// Returns { added, skipped } counts.
async function writeLeads(leads) {
  const auth = getAuthClient();
  const sheets = getSheetsClient(await auth.getClient());

  await ensureHeaders(sheets);

  const existingNames = await getExistingBusinessNames(sheets);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();

    if (existingNames.has(key)) {
      logger.info(`Duplicate skipped: "${lead.businessName}"`);
      skipped++;
      continue;
    }

    // Column order must match SHEET_COLUMNS in config.js exactly.
    // If you add a column, add its value here at the same index.
    newRows.push([
      today,              // Date Added
      lead.businessName,  // Business Name
      lead.firstName,     // Owner First Name
      lead.lastName,      // Owner Last Name
      lead.phone,         // Phone Number
      lead.city,          // City
      lead.website,       // Website
      '',                 // Called   (filled manually)
      '',                 // Notes    (filled manually)
    ]);

    // Track locally so we don't re-add the same business twice within one run
    // (Apollo can return the same company twice under different contacts).
    existingNames.add(key);
  }

  const added = await appendRows(sheets, newRows);
  return { added, skipped };
}

// Used by setup.js to confirm the API key and spreadsheet are reachable.
async function testConnection() {
  const auth = getAuthClient();
  const sheets = getSheetsClient(await auth.getClient());

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: 'spreadsheetId,properties.title',
  });

  return {
    spreadsheetId: meta.data.spreadsheetId,
    title: meta.data.properties?.title,
  };
}

module.exports = { writeLeads, testConnection, ensureHeaders };
