const { google } = require('googleapis');
const path = require('path');
const config = require('./config');
const log = require('./logger');

// Resolves the credentials path relative to the project root, not the cwd,
// so the script works when launched from any directory.
function resolveCredentials() {
  const raw = config.google.credentialsPath;
  return path.isAbsolute(raw)
    ? raw
    : path.resolve(__dirname, '..', raw.replace(/^\.\//, ''));
}

async function getAuthClient() {
  const credPath = resolveCredentials();
  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

/**
 * Returns the set of business names already in the sheet (column B, rows 2+).
 * Used for dedup before appending.
 */
async function getExistingBusinessNames() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = `${config.google.sheetName}!B2:B`;

  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range,
    });
  } catch (err) {
    throw new Error(`Failed to read existing sheet data: ${err.message}`);
  }

  const rows = res.data.values || [];
  const names = new Set(rows.map((r) => (r[0] || '').trim().toLowerCase()));
  log.info(`Sheet currently has ${names.size} existing businesses.`);
  return names;
}

/**
 * Appends new leads to the sheet, skipping any whose business name already
 * exists. Returns the count of rows actually written.
 */
async function appendLeads(leads) {
  const existing = await getExistingBusinessNames();

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (existing.has(key)) {
      skipped.push(lead.businessName);
      continue;
    }
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — left blank for manual entry
      '', // Notes  — left blank for manual entry
    ]);
    existing.add(key); // prevent dupes within this batch too
  }

  if (skipped.length) {
    log.info(`Skipped ${skipped.length} duplicate(s): ${skipped.join(', ')}`);
  }

  if (newRows.length === 0) {
    log.info('No new leads to append after dedup check.');
    return 0;
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  } catch (err) {
    throw new Error(`Failed to append rows to sheet: ${err.message}`);
  }

  log.info(`Appended ${newRows.length} new lead(s) to the spreadsheet.`);
  return newRows.length;
}

/**
 * Creates the spreadsheet with the correct headers if it doesn't exist yet.
 * Only needed on first run if you want the script to bootstrap the sheet.
 */
async function ensureHeaders() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!A1:I1`,
  });

  const firstRow = res.data.values?.[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [config.google.columns] },
    });
    log.info('Header row written to spreadsheet.');
  }
}

module.exports = { appendLeads, ensureHeaders, getExistingBusinessNames };
