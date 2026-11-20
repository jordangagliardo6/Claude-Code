const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let sheetsClient = null;

/**
 * Initializes and caches the authenticated Google Sheets client.
 */
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const credPath = config.sheets.credentialsPath;
  if (!credPath || !fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      'Set GOOGLE_CREDENTIALS_PATH in your .env file.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Ensures the spreadsheet has the correct header row.
 * Creates it if the sheet is empty.
 */
async function ensureHeaders(sheets) {
  const spreadsheetId = config.sheets.spreadsheetId;
  const sheetName = config.sheets.sheetName;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const existingRow = (res.data.values || [])[0];
  if (!existingRow || existingRow.length === 0) {
    console.log('[Sheets] Writing header row...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.sheetHeaders] },
    });
  }
}

/**
 * Reads all existing business names from the sheet to prevent duplicates.
 * Returns a Set of lowercase business names.
 */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = config.sheets.spreadsheetId;
  const sheetName = config.sheets.sheetName;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Column B is Business Name (index 1, so column B)
    range: `${sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  const names = new Set();
  for (const row of rows) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }
  return names;
}

/**
 * Appends new leads to the Google Sheet.
 * Skips any lead whose business name already exists.
 * Returns the count of rows actually added.
 */
async function appendLeads(leads) {
  if (!config.sheets.spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in environment variables.');
  }

  const sheets = await getSheetsClient();
  await ensureHeaders(sheets);

  const existing = await getExistingBusinessNames(sheets);
  console.log(`[Sheets] ${existing.size} existing businesses found — checking for duplicates...`);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const nameKey = (lead.businessName || '').toLowerCase().trim();
    if (!nameKey) continue; // Skip leads with no business name

    if (existing.has(nameKey)) {
      skipped.push(lead.businessName);
      continue;
    }

    // Build the row in column order: Date Added, Business Name, First, Last, Phone, City, Website, Called, Notes
    newRows.push([
      today,
      lead.businessName,
      lead.ownerFirst,
      lead.ownerLast,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — left blank
      '', // Notes — left blank
    ]);

    // Track in-memory so we don't double-add within this batch
    existing.add(nameKey);
  }

  if (skipped.length > 0) {
    console.log(`[Sheets] Skipped ${skipped.length} duplicate(s): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`);
  }

  if (newRows.length === 0) {
    console.log('[Sheets] No new leads to add.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${config.sheets.sheetName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[Sheets] Added ${newRows.length} new lead(s).`);
  return newRows.length;
}

/**
 * Quick connectivity test — reads the sheet metadata.
 */
async function testConnection() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.sheets.spreadsheetId,
    fields: 'spreadsheetId,properties.title',
  });
  return res.data;
}

module.exports = { appendLeads, testConnection, ensureHeaders, getSheetsClient };
