// ─────────────────────────────────────────────────────────────────────────────
// sheets.js — Google Sheets API client
// Reads existing leads (for deduplication) and appends new ones.
// Uses a service account for headless / scheduled operation — no browser needed.
// ─────────────────────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const path       = require('path');
const config     = require('./config');

// ── Auth ───────────────────────────────────────────────────────────────────────

/**
 * Build a GoogleAuth client from environment variables.
 *
 * Supports two credential sources (in priority order):
 *   1. GOOGLE_SERVICE_ACCOUNT_JSON — the entire service account JSON as a string
 *   2. GOOGLE_SERVICE_ACCOUNT_KEY_FILE — path to the downloaded JSON key file
 *
 * @returns {google.auth.GoogleAuth}
 */
function buildAuthClient() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. ' +
        'Make sure the entire service account file is on a single line.'
      );
    }
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
    try {
      credentials = require(keyPath);
    } catch {
      throw new Error(
        `Cannot read service account key file at: ${keyPath}\n` +
        'Check the path in GOOGLE_SERVICE_ACCOUNT_KEY_FILE.'
      );
    }
  } else {
    throw new Error(
      'No Google credentials found.\n' +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE (path to JSON) or ' +
      'GOOGLE_SERVICE_ACCOUNT_JSON (JSON as a string) in your .env file.'
    );
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch every value in column B (Business Name) to use for deduplication.
 * Skips row 1 (headers). Returns a lowercase Set for fast O(1) lookups.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const sheets        = google.sheets({ version: 'v4', auth: buildAuthClient() });
  const spreadsheetId = requireSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheetName}!B2:B`, // column B, skip header
  });

  const rows = response.data.values ?? [];
  return new Set(rows.flat().map((name) => name.toLowerCase().trim()));
}

/**
 * Append an array of lead objects as new rows in the spreadsheet.
 * Row layout matches config.columns exactly:
 *   Date Added | Business Name | Owner First Name | Owner Last Name |
 *   Phone Number | City | Website | Called (blank) | Notes (blank)
 *
 * @param {Array<Object>} leads - Normalized lead objects from apollo.js
 * @returns {Promise<number>} Number of rows written
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const sheets        = google.sheets({ version: 'v4', auth: buildAuthClient() });
  const spreadsheetId = requireSpreadsheetId();

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day  : '2-digit',
    year : 'numeric',
    timeZone: 'America/New_York',
  });

  // Build rows in the exact column order defined in config.js.
  // If you add or reorder columns in config.columns, update this array too.
  const rows = leads.map((lead) => [
    today,            // A — Date Added
    lead.businessName,// B — Business Name
    lead.firstName,   // C — Owner First Name
    lead.lastName,    // D — Owner Last Name
    lead.phone,       // E — Phone Number
    lead.city,        // F — City
    lead.website,     // G — Website
    '',               // H — Called     (left blank for manual use)
    '',               // I — Notes      (left blank for manual use)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range            : `${config.sheetName}!A:I`,
    valueInputOption : 'USER_ENTERED',
    insertDataOption : 'INSERT_ROWS',
    requestBody      : { values: rows },
  });

  return rows.length;
}

/**
 * Write the header row if the sheet is completely empty (first-time setup).
 * Safe to call on every run — it checks before writing.
 */
async function ensureHeaders() {
  const sheets        = google.sheets({ version: 'v4', auth: buildAuthClient() });
  const spreadsheetId = requireSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheetName}!A1:I1`,
  });

  const existing = response.data.values?.[0] ?? [];
  if (existing.length > 0) return; // headers already present

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range            : `${config.sheetName}!A1:I1`,
    valueInputOption : 'USER_ENTERED',
    requestBody      : { values: [config.columns] },
  });

  console.log('  [Sheets] Header row created successfully.');
}

/**
 * Quick connectivity check — reads metadata from the spreadsheet.
 * Used by setup-check.js.
 *
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function testConnection() {
  try {
    requireSpreadsheetId(); // will throw if not set

    const sheets   = google.sheets({ version: 'v4', auth: buildAuthClient() });
    const response = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
      fields        : 'spreadsheetId,properties/title',
    });

    const title = response.data.properties?.title ?? 'Untitled';
    return { ok: true, message: `Connected to spreadsheet: "${title}"` };
  } catch (err) {
    if (err.message.includes('GOOGLE_SPREADSHEET_ID')) return { ok: false, message: err.message };
    if (err.message.includes('credentials'))           return { ok: false, message: err.message };

    const code = err.code ?? err.status ?? 'error';
    return { ok: false, message: `[${code}] ${err.message}` };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function requireSpreadsheetId() {
  const id = config.spreadsheetId;
  if (!id) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set. Add it to your .env file.');
  }
  return id;
}

module.exports = { getExistingBusinessNames, appendLeads, ensureHeaders, testConnection };
