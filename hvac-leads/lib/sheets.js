/**
 * Google Sheets helpers
 *
 * Uses the Google Sheets API v4 via the `googleapis` package.
 * Authentication: OAuth2 with a stored token (token.json).
 * On first run, the setup script handles the OAuth consent flow.
 *
 * Sheet column layout (must match COLUMNS order):
 *   A: Date Added | B: Business Name | C: Owner First Name
 *   D: Owner Last Name | E: Phone Number | F: City
 *   G: Website | H: Called (blank) | I: Notes (blank)
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Scopes required: read existing rows + append new ones
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const COLUMNS = [
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

/**
 * Build an authenticated Google Sheets API client.
 * Reads credentials.json and token.json from paths in env / defaults.
 *
 * @returns {Promise<import('googleapis').sheets_v4.Sheets>}
 */
async function getSheetsClient() {
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || './token.json';

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials file not found at ${credentialsPath}. ` +
      'Run "node setup.js" to complete the first-time setup.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `OAuth token not found at ${tokenPath}. ` +
      'Run "node setup.js" to authorise Google Drive access.'
    );
  }

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  oAuth2Client.setCredentials(token);

  // Auto-refresh the access token when it expires
  oAuth2Client.on('tokens', (newTokens) => {
    const updated = { ...token, ...newTokens };
    fs.writeFileSync(tokenPath, JSON.stringify(updated));
  });

  return google.sheets({ version: 'v4', auth: oAuth2Client });
}

/**
 * Read all values from the Business Name column (B) to build a dedup set.
 *
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} tabName - e.g. "Untitled" or "Sheet1"
 * @returns {Promise<Set<string>>} lowercase business names already in the sheet
 */
async function getExistingBusinessNames(sheets, spreadsheetId, tabName) {
  const range = `'${tabName}'!B2:B`; // skip header row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const names = new Set(
    rows.flat().map(n => normaliseBusinessName(n))
  );
  return names;
}

/**
 * Append new lead rows to the sheet.
 * Only inserts leads whose business name is not already present.
 *
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} tabName
 * @param {Lead[]} leads       - new contacts from Apollo
 * @param {Set<string>} existing - normalised names already in the sheet
 * @returns {Promise<{ added: number, skipped: number, rows: string[][] }>}
 */
async function appendLeads(sheets, spreadsheetId, tabName, leads, existing) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = normaliseBusinessName(lead.businessName);
    if (!key || existing.has(key)) {
      skipped++;
      continue;
    }

    newRows.push([
      today,                  // A: Date Added
      lead.businessName,      // B: Business Name
      lead.ownerFirstName,    // C: Owner First Name
      lead.ownerLastName,     // D: Owner Last Name
      lead.phoneNumber,       // E: Phone Number
      lead.city,              // F: City
      lead.website,           // G: Website
      '',                     // H: Called (blank)
      '',                     // I: Notes (blank)
    ]);

    existing.add(key); // prevent intra-batch duplication
  }

  if (newRows.length === 0) {
    return { added: 0, skipped, rows: [] };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabName}'!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return { added: newRows.length, skipped, rows: newRows };
}

/**
 * Normalise a business name for deduplication:
 * lowercase, strip punctuation and common words like "inc", "llc", "co".
 */
function normaliseBusinessName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[.,&'"]/g, '')
    .replace(/\b(inc|llc|co|corp|company|services|heating|cooling|hvac|and|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { getSheetsClient, getExistingBusinessNames, appendLeads, COLUMNS };
