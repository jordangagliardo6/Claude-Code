/**
 * Google Sheets API client for reading and appending lead rows.
 *
 * Authentication: Service Account (recommended for scheduled/unattended jobs)
 *   1. Create a service account in Google Cloud Console
 *   2. Enable the Google Sheets API for your project
 *   3. Download the JSON key file and set GOOGLE_SERVICE_ACCOUNT_KEY_FILE in .env
 *   4. Share your spreadsheet with the service account email (Editor access)
 *
 * Alternative (OAuth2): Replace auth() below with oauth2Client if you prefer
 * personal account credentials.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';

// Column order must match the spreadsheet header row exactly
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank by automation)
  'Notes',            // I  (left blank by automation)
];

function auth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set in environment');
  const resolvedPath = path.resolve(keyFile);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Service account key file not found: ${resolvedPath}`);
  }
  const credentials = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function sheetsClient() {
  return google.sheets({ version: 'v4', auth: auth() });
}

/**
 * Read existing Business Name entries from column B to enable deduplication.
 * Returns a Set<string> of lowercase business names already in the sheet.
 */
async function getExistingBusinessNames() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID is not set in environment');

  const sheets = sheetsClient();
  const range = `${SHEET_NAME}!B:B`; // Business Name column only
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });

  const rows = res.data.values || [];
  // Skip header row (index 0), lowercase for case-insensitive comparison
  return new Set(
    rows
      .slice(1)
      .map((r) => (r[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Append an array of lead objects to the sheet.
 * Skips leads whose Business Name already exists in the sheet.
 *
 * @param {Object[]} leads - Array of {businessName, ownerFirstName, ownerLastName,
 *                           phoneNumber, city, website} objects
 * @param {string} dateAdded - ISO date string (YYYY-MM-DD)
 * @returns {{ added: number, skipped: number }} Summary
 */
async function appendLeads(leads, dateAdded) {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID is not set in environment');
  if (!leads.length) return { added: 0, skipped: 0 };

  const existing = await getExistingBusinessNames();

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = (lead.businessName || '').trim().toLowerCase();
    if (!key) { skipped++; continue; }
    if (existing.has(key)) { skipped++; continue; }

    // Build the row in column order (Called and Notes stay blank)
    newRows.push([
      dateAdded,
      lead.businessName,
      lead.ownerFirstName || '',
      lead.ownerLastName || '',
      lead.phoneNumber || '',
      lead.city || '',
      lead.website || '',
      '', // Called
      '', // Notes
    ]);

    // Add to the in-memory set so we don't double-insert within the same run
    existing.add(key);
  }

  if (newRows.length) {
    const sheets = sheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

/**
 * Verify that the sheet is reachable and has the expected header row.
 * Called by test-connection.js on first run.
 */
async function verifyConnection() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID is not set in environment');

  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:I1`,
  });

  const header = (res.data.values?.[0] || []).map((h) => h.trim());
  const expected = COLUMNS.map((c) => c.trim());
  const matches = expected.every((col, i) => header[i] === col);

  return {
    ok: true,
    spreadsheetId: SPREADSHEET_ID,
    sheetName: SHEET_NAME,
    headerRow: header,
    headerMatches: matches,
  };
}

module.exports = { appendLeads, getExistingBusinessNames, verifyConnection, COLUMNS };
