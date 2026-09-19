// ─────────────────────────────────────────────────────────────────────────────
// sheetsService.js — Google Sheets read/append via service account
//
// Setup (one-time):
//   1. Enable Google Sheets API in Google Cloud Console
//   2. Create a service account → download JSON key
//   3. Share your spreadsheet with the service account email (Editor access)
//   4. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH and GOOGLE_SPREADSHEET_ID in .env
// ─────────────────────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const path = require('path');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

// Header row — must match config.COLUMNS order
const HEADER_ROW = [
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

// ── Build authenticated Sheets client ────────────────────────────────────────
function getSheetsClient() {
  const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Read all values in column B (Business Name) to build dedup set ───────────
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const range = `${SHEET_NAME}!B:B`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  // rows[0] is the header ("Business Name"), skip it
  const names = new Set(
    rows
      .slice(1)
      .map((r) => (r[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );

  return names;
}

// ── Ensure the header row exists (writes it if the sheet is empty) ───────────
async function ensureHeader() {
  const sheets = getSheetsClient();
  const range = `${SHEET_NAME}!A1:I1`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    console.log('  Header row written to sheet.');
  }
}

// ── Append new leads, skipping duplicates ────────────────────────────────────
// Returns { added: number, skipped: number }
async function appendLeads(leads) {
  if (!leads.length) return { added: 0, skipped: 0 };

  await ensureHeader();
  const existing = await getExistingBusinessNames();

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = (lead.businessName || '').trim().toLowerCase();
    if (!key || existing.has(key)) {
      skipped++;
      continue;
    }
    newRows.push([
      lead.dateAdded,
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

  if (newRows.length) {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

// ── Verify Sheets access (called during --test mode) ─────────────────────────
async function testConnection() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'properties.title',
  });
  return res.data.properties?.title || '(untitled)';
}

module.exports = { appendLeads, testConnection };
