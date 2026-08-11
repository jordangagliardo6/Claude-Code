// ─── Google Sheets Module ────────────────────────────────────────────────────
// Reads existing leads, deduplicates by Business Name, and appends new rows.
//
// Auth uses a Google service account (credentials.json).
// The service account must be granted Editor access to the target spreadsheet.
// ────────────────────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'),
    scopes: SCOPES,
  });
}

// Returns all values currently in the sheet
async function readSheet(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:I`,
  });
  return res.data.values || [];
}

// Writes column headers to row 1
async function writeHeaders(sheets, spreadsheetId, sheetName, columns) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [columns] },
  });
}

// Core function: dedup then append new lead rows
async function appendLeads(leads, config) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const { spreadsheetId, sheetName, columns } = config.sheets;

  // Read current sheet state
  const existing = await readSheet(sheets, spreadsheetId, sheetName);

  // If sheet is empty, write headers first
  if (!existing.length) {
    await writeHeaders(sheets, spreadsheetId, sheetName, columns);
  }

  // Build a set of existing business names (case-insensitive) for dedup
  // Row 0 is the header; data starts at row 1
  const dataRows = existing.length > 1 ? existing.slice(1) : [];
  const existingNames = new Set(
    dataRows.map(row => (row[1] || '').toLowerCase().trim())
  );

  // Date in M/D/YYYY format, Eastern time
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });

  // Filter duplicates and build rows matching column order
  const newRows = leads
    .filter(lead => !existingNames.has(lead.businessName.toLowerCase().trim()))
    .map(lead => [
      today,              // Date Added
      lead.businessName,  // Business Name
      lead.firstName,     // Owner First Name
      lead.lastName,      // Owner Last Name
      lead.phone,         // Phone Number
      lead.city,          // City
      lead.website,       // Website
      '',                 // Called   — intentionally blank
      '',                 // Notes    — intentionally blank
    ]);

  if (!newRows.length) {
    return { added: 0, skipped: leads.length };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return { added: newRows.length, skipped: leads.length - newRows.length };
}

// Verify Google Sheets access — returns the spreadsheet title on success
async function testConnection(spreadsheetId) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return meta.data.properties.title;
}

module.exports = { appendLeads, testConnection };
