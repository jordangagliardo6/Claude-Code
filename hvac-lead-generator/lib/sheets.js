/**
 * Google Sheets integration via googleapis SDK.
 *
 * Authentication: Service Account (recommended for cron jobs).
 * Set GOOGLE_APPLICATION_CREDENTIALS to the path of your service account JSON.
 *
 * Required environment variables:
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service account key JSON
 *   GOOGLE_SHEET_ID               — the spreadsheet ID from the URL
 *   SHEET_TAB_NAME                — tab name (default: "Leads")
 */

const { google } = require('googleapis');
const config = require('../config');

let _sheetsClient = null;

/**
 * Returns an authorized Google Sheets client (cached after first call).
 */
async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const auth = new google.auth.GoogleAuth({
    // Uses GOOGLE_APPLICATION_CREDENTIALS env var automatically
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  _sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return _sheetsClient;
}

/**
 * Ensures the header row exists on the sheet.
 * If the sheet is empty, writes the header row first.
 */
async function ensureHeaderRow(sheets) {
  const range = `${config.sheets.sheetName}!A1:I1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheets.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [config.sheets.columns] },
    });
    console.log('Header row written to sheet.');
  }
}

/**
 * Fetches all existing Business Names from column B (index 1).
 * Returns a Set<string> of lowercased names for fast duplicate lookup.
 */
async function getExistingBusinessNames(sheets) {
  const range = `${config.sheets.sheetName}!B:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  // Skip header row (index 0), normalize to lowercase
  return new Set(
    rows
      .slice(1)
      .map(row => (row[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Appends new leads to the sheet, skipping duplicates.
 *
 * @param {Array<Object>} leads  - normalized lead objects from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  const sheets = await getSheetsClient();

  await ensureHeaderRow(sheets);

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
    const nameKey = lead.businessName.trim().toLowerCase();

    if (!nameKey || existingNames.has(nameKey)) {
      skipped++;
      continue;
    }

    // Build row in column order: Date Added, Business Name, First, Last, Phone, City, Website, Called, Notes
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',  // Called — left blank
      '',  // Notes — left blank
    ]);

    // Track in-memory so duplicates within the same batch are also caught
    existingNames.add(nameKey);
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${config.sheets.sheetName}!A:I`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

/**
 * Quick connection test — reads sheet metadata.
 * Throws if credentials or spreadsheet ID are invalid.
 */
async function testConnection() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.sheets.spreadsheetId,
    fields: 'properties.title',
  });
  return res.data.properties.title;
}

module.exports = { appendLeads, testConnection };
