/**
 * sheets.js — Google Sheets read/write operations
 *
 * Handles all interaction with the target spreadsheet:
 *   - Creating the header row on first use
 *   - Reading existing business names (for duplicate detection)
 *   - Appending new lead rows
 *
 * Authentication supports two modes (set in .env):
 *   A) Service Account — recommended for cron jobs (GOOGLE_SERVICE_ACCOUNT_KEY_FILE)
 *   B) OAuth2          — if you prefer user-account credentials
 *
 * Spreadsheet column order (A → I):
 *   Date Added | Business Name | Owner First Name | Owner Last Name |
 *   Phone Number | City | Website | Called | Notes
 */

const { google } = require('googleapis');
const fs = require('fs');

// ─── Column layout ────────────────────────────────────────────────────────────

const HEADERS = [
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

// Column index (0-based) used for duplicate-check
const BUSINESS_NAME_COL = 1;

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Builds and returns an authenticated Google Sheets API client. */
function buildSheetsClient() {
  let auth;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    // Option A: Service Account
    const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
    if (!fs.existsSync(keyFilePath)) {
      throw new Error(
        `Service account key file not found at "${keyFilePath}". ` +
        'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE in your .env file.'
      );
    }
    const key = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
    auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else if (
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  ) {
    // Option B: OAuth2
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    auth = oAuth2Client;
  } else {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE (recommended) ' +
      'or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN in your .env file.'
    );
  }

  return google.sheets({ version: 'v4', auth });
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────

function getSheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set in environment variables.');
  return id;
}

function getTabName() {
  return process.env.GOOGLE_SHEET_TAB || 'Sheet1';
}

// ─── Ensure header row exists ─────────────────────────────────────────────────

/**
 * Checks whether row 1 already has headers; writes them if the sheet is empty.
 * Safe to call on every run — it's a no-op if headers already exist.
 */
async function ensureHeaders(sheets) {
  const spreadsheetId = getSheetId();
  const tab = getTabName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:I1`,
  });

  const firstRow = res.data.values?.[0] ?? [];
  if (firstRow.length === 0) {
    // Sheet is empty — write the header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    console.log('  Header row created in spreadsheet.');
  }
}

// ─── Read existing business names ─────────────────────────────────────────────

/**
 * Returns a Set of business names already in the sheet (lowercased + trimmed)
 * so duplicate detection is case-insensitive.
 */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = getSheetId();
  const tab = getTabName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:B`, // Date Added + Business Name columns
  });

  const rows = res.data.values ?? [];
  const names = new Set();

  for (let i = 1; i < rows.length; i++) { // skip header row (index 0)
    const name = (rows[i]?.[BUSINESS_NAME_COL] ?? '').trim().toLowerCase();
    if (name) names.add(name);
  }

  return names;
}

// ─── Append new leads ─────────────────────────────────────────────────────────

/**
 * Appends an array of lead rows to the spreadsheet.
 *
 * @param {object[]} leads  Normalized lead objects from apollo.js
 * @returns {number}        Number of rows actually written
 */
async function appendLeads(leads) {
  if (leads.length === 0) return 0;

  const sheets = buildSheetsClient();
  const spreadsheetId = getSheetId();
  const tab = getTabName();

  await ensureHeaders(sheets);

  // Read existing names to filter duplicates
  const existing = await getExistingBusinessNames(sheets);
  const today = formatDate(new Date());

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const nameKey = lead.businessName.trim().toLowerCase();
    if (!nameKey) continue; // skip leads with no business name
    if (existing.has(nameKey)) {
      skipped.push(lead.businessName);
      continue;
    }

    newRows.push([
      today,                // Date Added
      lead.businessName,    // Business Name
      lead.firstName,       // Owner First Name
      lead.lastName,        // Owner Last Name
      lead.phone,           // Phone Number
      lead.city,            // City
      lead.website,         // Website
      '',                   // Called (blank)
      '',                   // Notes (blank)
    ]);

    // Track in-memory so we don't add duplicates within the same batch
    existing.add(nameKey);
  }

  if (skipped.length > 0) {
    console.log(`  Skipped ${skipped.length} duplicate(s): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}`);
  }

  if (newRows.length === 0) {
    console.log('  No new unique leads to append.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`  Appended ${newRows.length} new lead(s) to spreadsheet.`);
  return newRows.length;
}

// ─── Connection test ──────────────────────────────────────────────────────────

/** Verifies Google Sheets credentials by reading the spreadsheet metadata. */
async function testSheetsConnection() {
  const sheets = buildSheetsClient();
  const spreadsheetId = getSheetId();

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const title = res.data.properties?.title || 'Unknown';
  const tabNames = res.data.sheets?.map(s => s.properties?.title).join(', ') || 'none';

  return { title, tabs: tabNames };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

module.exports = { appendLeads, testSheetsConnection, HEADERS };
