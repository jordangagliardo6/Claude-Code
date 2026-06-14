const { google } = require('googleapis');
const path = require('path');
const logger = require('./logger');

// ─── Column Layout ─────────────────────────────────────────────────────────
// Change COLUMN_ORDER to reorder or add columns without touching workflow.js
const HEADER_ROW = [
  'Date Added',        // A
  'Business Name',     // B  ← used for duplicate detection
  'Owner First Name',  // C
  'Owner Last Name',   // D
  'Phone Number',      // E
  'City',              // F
  'Website',           // G
  'Called',            // H  (left blank — for your manual notes)
  'Notes'              // I  (left blank — for your manual notes)
];

const BUSINESS_NAME_COLUMN = 'B'; // Must match HEADER_ROW position 1 (0-indexed)
// ─────────────────────────────────────────────────────────────────────────────

function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID is not set. Add it to your .env file.');
  return id;
}

function getSheetName() {
  return process.env.SHEET_NAME || 'Sheet1';
}

async function getAuthClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set. Add it to your .env file.');
  }

  const resolvedPath = path.resolve(keyFile);
  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return auth.getClient();
}

function getSheetsClient(authClient) {
  return google.sheets({ version: 'v4', auth: authClient });
}

// Ensures the header row exists on first use.
async function ensureHeaders(sheets) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const range = `${sheetName}!A1:${String.fromCharCode(64 + HEADER_ROW.length)}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = res.data.values?.[0] ?? [];

  if (existing.length === 0) {
    logger.info('Sheet is empty — writing header row');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] }
    });
  }
}

// Reads column B (Business Name) and returns a Set of existing names (lowercased).
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const range = `${sheetName}!${BUSINESS_NAME_COLUMN}2:${BUSINESS_NAME_COLUMN}10000`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values ?? [];

  return new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
}

// Appends an array of lead objects as new rows at the bottom of the sheet.
async function appendLeads(sheets, leads) {
  if (leads.length === 0) return;

  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();
  const today = new Date().toLocaleDateString('en-US'); // MM/DD/YYYY

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank
    ''  // Notes — left blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });

  logger.info(`Appended ${leads.length} new lead(s) to Google Sheet`);
}

// Initializes auth and returns { sheets, existingNames }.
async function initSheets() {
  const authClient = await getAuthClient();
  const sheets = getSheetsClient(authClient);
  await ensureHeaders(sheets);
  const existingNames = await getExistingBusinessNames(sheets);
  return { sheets, existingNames };
}

// Lightweight check that the Sheet is reachable and the service account has access.
async function testSheetsConnection() {
  try {
    if (!process.env.SPREADSHEET_ID) {
      console.error('  ❌ SPREADSHEET_ID is not set in .env');
      return false;
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
      console.error('  ❌ GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set in .env');
      return false;
    }

    const authClient = await getAuthClient();
    const sheets = getSheetsClient(authClient);

    const res = await sheets.spreadsheets.get({
      spreadsheetId: getSpreadsheetId(),
      fields: 'properties.title,sheets.properties.title'
    });

    const title = res.data.properties?.title;
    const tabNames = res.data.sheets?.map(s => s.properties.title).join(', ');
    console.log(`  ✅ Google Sheets connected — spreadsheet: "${title}"`);
    console.log(`     Tabs found: ${tabNames}`);
    console.log(`     Using tab: "${getSheetName()}"`);
    return true;
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error(`  ❌ Google Sheets connection failed: ${detail}`);
    if (detail.includes('PERMISSION_DENIED') || detail.includes('not found')) {
      console.error('     → Share the spreadsheet with your service account email address.');
    }
    return false;
  }
}

module.exports = {
  initSheets,
  appendLeads,
  testSheetsConnection
};
