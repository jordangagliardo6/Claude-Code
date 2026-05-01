/**
 * sheets.js — Google Sheets integration
 *
 * Reads existing data, checks for duplicates by Business Name,
 * and appends new lead rows.
 *
 * Auth: Google service account (recommended for scheduled automation).
 * The service account must have Editor access to the target spreadsheet.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Column order matches the spreadsheet header row exactly.
// Change here if you ever reorder columns — the code adapts automatically.
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank)
  'Notes',            // I  (left blank)
];

/**
 * Build an authenticated Google Sheets client using a service account JSON file.
 */
function buildSheetsClient(serviceAccountPath) {
  const keyFile = path.resolve(serviceAccountPath);
  if (!fs.existsSync(keyFile)) {
    throw new Error(
      `Service account file not found at: ${keyFile}\n` +
      'Download it from Google Cloud Console → IAM → Service Accounts → Keys.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensure the header row exists. Creates it if the sheet is empty.
 */
async function ensureHeader(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:${columnLetter(COLUMNS.length)}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = res.data.values?.[0] ?? [];

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
  }
}

/**
 * Read all existing Business Name values from column B (index 1).
 * Returns a lowercase Set for fast O(1) lookup.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!B2:B`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values ?? [];
  return new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
}

/**
 * Append an array of lead objects to the spreadsheet.
 * Skips any lead whose Business Name is already in `existingNames`.
 *
 * @param {object} opts
 * @param {string} opts.serviceAccountPath
 * @param {string} opts.spreadsheetId
 * @param {string} opts.sheetName
 * @param {Array}  opts.leads  — normalized lead objects from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads({ serviceAccountPath, spreadsheetId, sheetName, leads }) {
  const sheets = buildSheetsClient(serviceAccountPath);

  await ensureHeader(sheets, spreadsheetId, sheetName);

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (existingNames.has(key)) {
      skipped++;
      continue;
    }
    existingNames.add(key); // prevent same-run duplicates

    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — blank
      '', // Notes — blank
    ]);
  }

  if (newRows.length > 0) {
    const appendRange = `${sheetName}!A:I`;
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: appendRange,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

/**
 * Test that credentials + spreadsheet access are working.
 * Returns the spreadsheet title on success, throws on failure.
 */
async function testConnection({ serviceAccountPath, spreadsheetId }) {
  const sheets = buildSheetsClient(serviceAccountPath);
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties.title;
}

/** Convert a 1-based column index to a letter (1→A, 26→Z, 27→AA …) */
function columnLetter(n) {
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = { appendLeads, testConnection };
