const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { google: googleConfig, SHEET_COLUMNS } = require('./config');

/**
 * Build a Google auth client from service account credentials.
 * Supports both a file path and an inline JSON string (for environments
 * where you can't store files, e.g. Heroku).
 */
function getAuthClient() {
  let credentials;

  if (googleConfig.keyJson) {
    // Inline JSON string from env var
    try {
      credentials = JSON.parse(googleConfig.keyJson);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  } else {
    const keyPath = path.resolve(googleConfig.keyPath);
    if (!fs.existsSync(keyPath)) {
      throw new Error(
        `Google service account key not found at: ${keyPath}\n` +
        'See the setup guide (README.md) for instructions.'
      );
    }
    credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Return the Sheets API client.
 */
async function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensure the sheet has the correct header row.
 * If the sheet is empty, write the header. If it already has data, verify
 * the first row matches — warn but don't overwrite.
 */
async function ensureHeader(sheets) {
  const range = `${googleConfig.sheetName}!A1:${colLetter(SHEET_COLUMNS.length)}1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: googleConfig.spreadsheetId,
    range,
  });

  const existing = res.data.values?.[0] || [];
  if (existing.length === 0) {
    // Write header
    await sheets.spreadsheets.values.update({
      spreadsheetId: googleConfig.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS] },
    });
    console.log('Header row written to sheet.');
  } else if (existing.join('|') !== SHEET_COLUMNS.join('|')) {
    console.warn(
      'WARNING: Sheet header does not match expected columns.\n' +
      `  Expected: ${SHEET_COLUMNS.join(', ')}\n` +
      `  Found:    ${existing.join(', ')}`
    );
  }
}

/**
 * Read all existing business names from column B (index 1) to detect duplicates.
 * Returns a Set of lowercased business names.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: googleConfig.spreadsheetId,
    // Column B = Business Name, skip row 1 (header)
    range: `${googleConfig.sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.flat().map(n => n.toLowerCase().trim()).filter(Boolean));
}

/**
 * Append an array of lead objects to the sheet.
 * Skips any lead whose business name already appears in the sheet.
 * Returns the count of rows actually added.
 */
async function appendLeads(leads) {
  if (!googleConfig.spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set in .env');
  }

  const sheets = await getSheetsClient();
  await ensureHeader(sheets);

  const existingNames = await getExistingBusinessNames(sheets);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (existingNames.has(key)) {
      skipped.push(lead.businessName);
      continue;
    }
    // Mark as seen so we don't add twice within the same run
    existingNames.add(key);

    // Row order must match SHEET_COLUMNS exactly
    newRows.push([
      today,              // Date Added
      lead.businessName,  // Business Name
      lead.firstName,     // Owner First Name
      lead.lastName,      // Owner Last Name
      lead.phone,         // Phone Number
      lead.city,          // City
      lead.website,       // Website
      '',                 // Called (blank)
      '',                 // Notes (blank)
    ]);
  }

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} duplicate(s): ${skipped.join(', ')}`);
  }

  if (newRows.length === 0) {
    console.log('No new leads to add after duplicate check.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: googleConfig.spreadsheetId,
    range: `${googleConfig.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return newRows.length;
}

/** Convert a 1-based column index to a letter (1→A, 26→Z, 27→AA …) */
function colLetter(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/**
 * Quick connectivity check — just reads the spreadsheet metadata.
 */
async function testConnection() {
  if (!googleConfig.spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set in .env');
  }
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: googleConfig.spreadsheetId,
    fields: 'properties.title',
  });
  return res.data.properties?.title || '(untitled)';
}

module.exports = { appendLeads, testConnection };
