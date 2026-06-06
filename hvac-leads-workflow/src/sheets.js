/**
 * Google Sheets client
 *
 * Uses a Service Account for authentication (no browser OAuth flow needed,
 * which is important for headless / scheduled use).
 *
 * Setup summary:
 *  1. Enable the Google Sheets API in Google Cloud Console.
 *  2. Create a Service Account and download the JSON key as credentials.json.
 *  3. Share the spreadsheet with the service account's client_email address.
 *  4. Set GOOGLE_APPLICATION_CREDENTIALS=./credentials.json in your .env.
 *
 * Full setup instructions are in README.md.
 */

const { google } = require('googleapis');
const config = require('./config');
const logger = require('./logger');

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAuth() {
  // Option B: inline JSON in env var (useful for Heroku, Railway, etc.)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // Option A: path to credentials file via GOOGLE_APPLICATION_CREDENTIALS
  return new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read all values from column B (Business Name) starting at row 2.
 * Returns a Set of lowercased names for O(1) duplicate checks.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const range = `${config.sheets.sheetName}!B2:B`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  return new Set(rows.map(row => (row[0] || '').toLowerCase().trim()));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append new leads to the spreadsheet.
 *
 * - Reads existing Business Names first to detect duplicates.
 * - Skips any lead whose business name already appears in the sheet.
 * - Appends all new rows in a single API call.
 *
 * @param {Array<{businessName,ownerFirstName,ownerLastName,phone,city,website}>} leads
 * @returns {Promise<number>} Number of rows actually added
 */
async function appendLeads(leads) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const { spreadsheetId, sheetName } = config.sheets;

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId);
  logger.info(`Sheet currently has ${existingNames.size} existing business(es). Checking for duplicates...`);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const newRows  = [];
  const skipped  = [];

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();

    if (existingNames.has(key)) {
      skipped.push(lead.businessName);
      continue;
    }

    newRows.push([
      today,                // A — Date Added
      lead.businessName,    // B — Business Name
      lead.ownerFirstName,  // C — Owner First Name
      lead.ownerLastName,   // D — Owner Last Name
      lead.phone,           // E — Phone Number
      lead.city,            // F — City
      lead.website,         // G — Website
      '',                   // H — Called  (left blank intentionally)
      '',                   // I — Notes   (left blank intentionally)
    ]);

    // Prevent within-run duplicates if Apollo returns the same org twice
    existingNames.add(key);
  }

  if (skipped.length > 0) {
    logger.info(`Skipped ${skipped.length} duplicate(s): ${skipped.join(', ')}`);
  }

  if (newRows.length === 0) {
    logger.info('No new leads to add — all results were already in the sheet.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:           `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:     { values: newRows },
  });

  logger.info(`Added ${newRows.length} new lead(s) to the spreadsheet.`);
  return newRows.length;
}

/**
 * Verify the Sheets connection by fetching spreadsheet metadata.
 */
async function testConnection() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const { spreadsheetId } = config.sheets;

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return {
    success:          true,
    spreadsheetTitle: res.data.properties.title,
    spreadsheetUrl:   `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  };
}

module.exports = { appendLeads, testConnection };
