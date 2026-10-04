const { google } = require('googleapis');
const path = require('path');
const { config } = require('./config');

let _auth = null;

// Returns an authenticated Sheets client using the service account key file.
async function getClient() {
  if (_auth) return _auth;

  const keyFilePath = path.resolve(config.sheets.keyFile);
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _auth = await auth.getClient();
  return _auth;
}

// Reads all existing business names from column B (case-insensitive dedup set).
async function getExistingBusinessNames() {
  const auth = await getClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetRef = `${config.sheets.sheetName}!B:B`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: sheetRef,
  });

  const values = response.data.values || [];
  // Skip header row; normalize to lowercase for case-insensitive comparison
  const names = values.slice(1).map((row) => (row[0] || '').trim().toLowerCase());
  return new Set(names);
}

// Appends an array of lead objects to the spreadsheet, skipping duplicates.
// Returns { added, skipped } counts.
async function appendLeads(leads) {
  const existingNames = await getExistingBusinessNames();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (!key) continue; // skip if we somehow got a nameless result

    if (existingNames.has(key)) {
      skipped.push(lead.businessName);
      continue;
    }

    // Match column order: Date Added, Business Name, First, Last, Phone, City, Website, Called, Notes
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

    // Add to the local set so we don't insert the same name twice within one run
    existingNames.add(key);
  }

  if (newRows.length === 0) {
    console.log('[Sheets] No new rows to add (all were duplicates or empty).');
    return { added: 0, skipped: skipped.length };
  }

  const auth = await getClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetRef = `${config.sheets.sheetName}!A:I`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheets.spreadsheetId,
    range: sheetRef,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[Sheets] Appended ${newRows.length} new rows. Skipped ${skipped.length} duplicates.`);
  if (skipped.length > 0) {
    console.log(`[Sheets] Skipped: ${skipped.join(', ')}`);
  }

  return { added: newRows.length, skipped: skipped.length };
}

// Quick connectivity check — reads the header row and verifies column names.
async function verifyConnection() {
  const auth = await getClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetRef = `${config.sheets.sheetName}!A1:I1`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: sheetRef,
  });

  const headers = (response.data.values?.[0] || []).map((h) => h.trim());
  const expected = config.sheets.columns;

  const mismatches = expected.filter((col, i) => headers[i] !== col);
  if (mismatches.length > 0) {
    console.warn(`[Sheets] WARNING: Header mismatch. Expected: ${expected.join(', ')}`);
    console.warn(`[Sheets]           Got:      ${headers.join(', ')}`);
  } else {
    console.log('[Sheets] Header row verified ✓');
  }

  return headers;
}

module.exports = { appendLeads, verifyConnection, getExistingBusinessNames };
