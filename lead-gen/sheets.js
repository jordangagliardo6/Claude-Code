/**
 * Google Sheets client
 *
 * Authentication: Google service account (recommended for unattended automation).
 * The service account JSON is pointed to by GOOGLE_SERVICE_ACCOUNT_KEY_FILE, or
 * the raw JSON string can be stored in GOOGLE_SERVICE_ACCOUNT_JSON.
 *
 * Setup steps (one-time):
 *   1. Create a service account in Google Cloud Console
 *   2. Grant it the "Google Sheets Editor" role (or share the sheet directly)
 *   3. Download the JSON key and point GOOGLE_SERVICE_ACCOUNT_KEY_FILE at it
 *   4. Share your Google Sheet with the service account email
 */

const { google } = require('googleapis');
const config = require('./config');

// ── Auth ─────────────────────────────────────────────────────────────────────

function getAuth() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // JSON string stored directly in an env var (handy for CI/GitHub Actions)
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    // Path to the downloaded key file
    credentials = require(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  } else {
    throw new Error(
      'Google credentials not found. Set GOOGLE_SERVICE_ACCOUNT_JSON (raw JSON string) ' +
      'or GOOGLE_SERVICE_ACCOUNT_KEY_FILE (path to the .json key file).'
    );
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

/** Return all values from the Business Name column (column B, index 1). */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = config.SPREADSHEET_ID;
  const range = `${config.SHEET_NAME}!B:B`; // Business Name column

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  // Skip the header row; normalize to lowercase for case-insensitive comparison
  return new Set(rows.slice(1).map(r => (r[0] || '').trim().toLowerCase()));
}

/** Ensure the header row exists; write it if the sheet is empty. */
async function ensureHeaders(sheets) {
  const spreadsheetId = config.SPREADSHEET_ID;
  const range = `${config.SHEET_NAME}!A1:Z1`;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = (res.data.values || [])[0] || [];

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${config.SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.SHEET_HEADERS] },
    });
    console.log('Header row written to sheet.');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append an array of lead objects to the spreadsheet.
 * Skips any lead whose Business Name already exists in the sheet.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {Promise<{appended: number, skipped: number}>}
 */
async function appendLeads(leads) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets);

  const existingNames = await getExistingBusinessNames(sheets);
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (!key || existingNames.has(key)) {
      skipped++;
      continue;
    }

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

    existingNames.add(key); // prevent intra-batch duplicates
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!A:I`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { appended: newRows.length, skipped };
}

/**
 * Lightweight connectivity check — verifies credentials and sheet access.
 */
async function testConnection() {
  if (config.SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID_HERE') {
    throw new Error(
      'GOOGLE_SPREADSHEET_ID is not set. Add it to your .env file or config.js.'
    );
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.SPREADSHEET_ID,
    fields: 'properties.title',
  });

  return res.data.properties.title;
}

module.exports = { appendLeads, testConnection };
