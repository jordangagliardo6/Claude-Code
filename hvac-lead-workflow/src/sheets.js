/**
 * Google Sheets integration
 *
 * Reads existing leads (for deduplication) and appends new ones.
 * Uses a Google Service Account for server-side auth (no browser popup needed).
 *
 * Setup:
 *   1. Create a Google Cloud project
 *   2. Enable the Google Sheets API
 *   3. Create a Service Account and download its JSON key
 *   4. Share your spreadsheet with the service account email (Editor access)
 *   5. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH in your .env
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Column order matches the spreadsheet layout exactly
const COLUMN_HEADERS = [
  'Date Added',     // A
  'Business Name',  // B
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',   // E
  'City',           // F
  'Website',        // G
  'Called',         // H — leave blank for manual use
  'Notes',          // I — leave blank for manual use
];

// 0-based index of "Business Name" in COLUMN_HEADERS (used for dedup check)
const BUSINESS_NAME_COL_INDEX = 1;

let _sheetsClient = null;

/** Initialise and cache the Sheets API client */
async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set in environment variables');
  }

  const resolvedPath = path.resolve(keyPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Service account key file not found at: ${resolvedPath}`);
  }

  const credentials = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

/**
 * Read all existing business names from the sheet.
 * Returns a Set of lowercased business names for fast O(1) lookup.
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  // Read only column B (Business Name) — skip header row
  const range = `${tab}!B2:B`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  const rows = res.data.values || [];
  const names = new Set(rows.map(r => (r[0] || '').trim().toLowerCase()));
  console.log(`[Sheets] Found ${names.size} existing business(es) in sheet.`);
  return names;
}

/**
 * Ensure the header row exists. If the sheet is empty, write headers first.
 */
async function ensureHeaderRow() {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:I1`,
  });

  const firstRow = (res.data.values || [[]])[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMN_HEADERS] },
    });
    console.log('[Sheets] Header row created.');
  }
}

/**
 * Append new leads to the sheet.
 * Skips any lead whose business name already exists in `existingNames`.
 *
 * @param {Array<Object>} leads - Normalized lead objects from apollo.js
 * @param {Set<string>} existingNames - Lowercased business names already in sheet
 * @returns {number} Count of rows actually appended
 */
async function appendLeads(leads, existingNames) {
  if (leads.length === 0) {
    console.log('[Sheets] No leads to append.');
    return 0;
  }

  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  for (const lead of leads) {
    const normalizedName = (lead.businessName || '').trim().toLowerCase();
    if (!normalizedName) continue; // skip leads with no business name
    if (existingNames.has(normalizedName)) {
      console.log(`[Sheets] Skipping duplicate: "${lead.businessName}"`);
      continue;
    }
    newRows.push([
      today,             // Date Added
      lead.businessName, // Business Name
      lead.firstName,    // Owner First Name
      lead.lastName,     // Owner Last Name
      lead.phone,        // Phone Number
      lead.city,         // City
      lead.website,      // Website
      '',                // Called  (intentionally blank)
      '',                // Notes   (intentionally blank)
    ]);
  }

  if (newRows.length === 0) {
    console.log('[Sheets] All leads were duplicates — nothing appended.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[Sheets] Appended ${newRows.length} new lead(s).`);
  return newRows.length;
}

module.exports = { getExistingBusinessNames, ensureHeaderRow, appendLeads };
