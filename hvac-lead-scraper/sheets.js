/**
 * Google Sheets integration
 * Reads existing leads (for deduplication) and appends new ones.
 *
 * Authentication: uses a Google Service Account.
 * Set GOOGLE_SERVICE_ACCOUNT_KEY to the full JSON string of your service account key.
 * Set GOOGLE_SHEET_ID to the ID from your spreadsheet URL.
 *
 * Column layout (edit COLUMN_HEADERS to change order/names):
 *   A: Date Added  B: Business Name  C: Owner First  D: Owner Last
 *   E: Phone       F: City           G: Website      H: Called  I: Notes
 */

const { google } = require('googleapis');

// ─── COLUMN STRUCTURE ────────────────────────────────────────────────────────
// Change these labels if you rename columns; keep them in the same order as
// the row-building logic in appendLeads() below.
const COLUMN_HEADERS = [
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

// Column letter for Business Name (used in deduplication read)
// A=0, B=1 → "B" for Business Name at index 1
const BUSINESS_NAME_COLUMN = 'B';
// ─────────────────────────────────────────────────────────────────────────────

function buildAuthClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON — check that you copied the full key file content');
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  return id;
}

/**
 * Returns a Set of business names already in the sheet (lowercased + trimmed).
 * Used to skip duplicates before appending.
 */
async function getExistingBusinessNames() {
  const auth = buildAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${BUSINESS_NAME_COLUMN}:${BUSINESS_NAME_COLUMN}`,
  });

  const rows = res.data.values ?? [];
  // Row 0 is the header — skip it
  return new Set(
    rows
      .slice(1)
      .map((row) => row[0]?.toLowerCase()?.trim())
      .filter(Boolean)
  );
}

/**
 * Appends an array of lead objects as new rows in the spreadsheet.
 *
 * @param {Array} leads - Lead objects with fields matching COLUMN_HEADERS order
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) return;

  const auth = buildAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSheetId();

  // Build rows in the exact column order defined by COLUMN_HEADERS
  const rows = leads.map((lead) => [
    lead.dateAdded,       // A: Date Added
    lead.businessName,    // B: Business Name
    lead.ownerFirstName,  // C: Owner First Name
    lead.ownerLastName,   // D: Owner Last Name
    lead.phone,           // E: Phone Number
    lead.city,            // F: City
    lead.website,         // G: Website
    '',                   // H: Called (left blank for manual tracking)
    '',                   // I: Notes (left blank for manual notes)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'A:I',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Writes the header row if A1 is empty.
 * Safe to call on every run — only writes if headers are missing.
 */
async function ensureHeaders() {
  const auth = buildAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A1:I1',
  });

  const existingHeaders = res.data.values?.[0];
  if (!existingHeaders || existingHeaders.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1:I1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [COLUMN_HEADERS] },
    });
    console.log('  ✓ Header row written to spreadsheet.');
  }
}

/**
 * Verifies that the sheet is accessible by reading a small range.
 * Returns the number of existing lead rows (not counting the header).
 */
async function verifySheetConnection() {
  const auth = buildAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${BUSINESS_NAME_COLUMN}:${BUSINESS_NAME_COLUMN}`,
  });

  const rows = res.data.values ?? [];
  const existingLeads = Math.max(0, rows.length - 1); // subtract header
  return { success: true, existingLeads };
}

module.exports = {
  getExistingBusinessNames,
  appendLeads,
  ensureHeaders,
  verifySheetConnection,
};
