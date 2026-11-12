/**
 * sheets.js — Google Sheets client using a service account.
 *
 * Reads the existing Business Name column to detect duplicates,
 * then appends new rows to the bottom of the sheet.
 */

const { google } = require('googleapis');
const cfg = require('./config');

/** Build an authorised Sheets client from the service account key file. */
function getClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials.json';
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/** Return a Set of lowercased business names already in the sheet. */
async function getExistingNames(sheets, spreadsheetId) {
  const range = `${cfg.SHEET_TAB}!B2:B`; // Business Name column, skip header
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  return new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
}

/**
 * Append leads to the spreadsheet, skipping any whose business name already
 * appears in column B.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not set in environment variables.');

  const sheets = getClient();
  const existing = await getExistingNames(sheets, spreadsheetId);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    existing.add(key); // prevent intra-batch duplicates
    newRows.push([
      today,            // Date Added
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',               // Called (blank)
      '',               // Notes (blank)
    ]);
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${cfg.SHEET_TAB}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

module.exports = { appendLeads };
