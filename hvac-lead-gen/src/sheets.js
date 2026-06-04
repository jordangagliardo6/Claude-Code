// Google Sheets client — reads existing data for dedup and appends new leads
const { google } = require('googleapis');
const path = require('path');
const logger = require('./logger');

// ── Column layout — edit COLUMNS to add/reorder fields ──
const COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank intentionally
  'Notes',    // left blank intentionally
];

function getConfig() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName     = process.env.GOOGLE_SHEET_NAME || 'Leads';
  const credPath      = process.env.GOOGLE_CREDENTIALS_PATH || path.join(process.cwd(), 'credentials.json');

  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');
  return { spreadsheetId, sheetName, credPath };
}

async function buildClient() {
  const { credPath } = getConfig();
  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// Ensure the target sheet tab exists; create it if missing
async function ensureSheetTab(sheets, spreadsheetId, sheetName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === sheetName);
  if (!exists) {
    logger.info(`Sheet tab "${sheetName}" not found — creating it`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
  }
}

// Write header row if A1 is empty
async function ensureHeaderRow(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:${colLetter(COLUMNS.length)}1`;
  const res   = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  if (!res.data.values?.length) {
    logger.info('Writing header row');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
  }
}

// Read column B (Business Name) to build a dedup set
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,
  });
  const rows = res.data.values ?? [];
  // Skip header row; normalise to lowercase for case-insensitive comparison
  return new Set(rows.slice(1).map(r => (r[0] ?? '').toLowerCase().trim()));
}

// Append an array of lead objects — deduplicates by Business Name before writing
async function appendLeads(leads) {
  const { spreadsheetId, sheetName } = getConfig();
  const sheets = await buildClient();

  await ensureSheetTab(sheets, spreadsheetId, sheetName);
  await ensureHeaderRow(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);
  logger.info(`Sheet has ${existing.size} existing businesses`);

  const today   = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const key = (lead.businessName ?? '').toLowerCase().trim();
    if (!key || existing.has(key)) {
      skipped.push(lead.businessName || '(blank)');
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
      '', // Called
      '', // Notes
    ]);
    existing.add(key); // prevent intra-batch duplicates
  }

  if (skipped.length) logger.info(`Skipped ${skipped.length} duplicates`, { skipped });

  if (newRows.length === 0) {
    logger.info('No new leads to append — all were duplicates or blank');
    return { added: 0, skipped: skipped.length };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:${colLetter(COLUMNS.length)}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.info(`Appended ${newRows.length} new leads to "${sheetName}"`);
  return { added: newRows.length, skipped: skipped.length };
}

// Verify connectivity — used by setup.js
async function testConnection() {
  const { spreadsheetId } = getConfig();
  const sheets = await buildClient();
  const res    = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties?.title ?? 'Unknown Spreadsheet';
}

// Convert a 1-based column index to a letter (1→A, 9→I, 26→Z, 27→AA)
function colLetter(n) {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

module.exports = { appendLeads, testConnection };
