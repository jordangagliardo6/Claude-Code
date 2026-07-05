/**
 * sheets.js — Google Sheets read/write integration.
 *
 * Handles:
 *  - OAuth2 token loading from credentials/token.json
 *  - Ensuring the header row exists on first run
 *  - Duplicate detection by Business Name (case-insensitive)
 *  - Appending new lead rows
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'credentials', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Build and return an authenticated Google OAuth2 client.
 * Throws a clear error if credentials or token files are missing.
 *
 * @returns {Promise<google.auth.OAuth2>}
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Google OAuth credentials not found at: ${CREDENTIALS_PATH}\n` +
      `Run "npm run setup-auth" to complete Google authentication.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  // Google returns credentials under "installed" (Desktop) or "web" key
  const creds = raw.installed || raw.web;
  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0]
  );

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      `Google OAuth token not found at: ${TOKEN_PATH}\n` +
      `Run "npm run setup-auth" to authenticate with Google.`
    );
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oAuth2Client.setCredentials(token);

  // Automatically save refreshed tokens so they don't expire
  oAuth2Client.on('tokens', (refreshed) => {
    if (refreshed.refresh_token) {
      token.refresh_token = refreshed.refresh_token;
    }
    token.access_token = refreshed.access_token;
    token.expiry_date = refreshed.expiry_date;
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  });

  return oAuth2Client;
}

/**
 * Ensure the header row exists in the sheet.
 * Safe to call on every run — does nothing if headers already exist.
 *
 * @param {Object} sheets - googleapis sheets client
 * @param {string} spreadsheetId
 */
async function ensureHeaders(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheetTab}!A1:${columnLetter(config.sheetHeaders.length)}1`,
  });

  const existing = (res.data.values || [[]])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${config.sheetTab}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [config.sheetHeaders] },
    });
    console.log('  → Sheet headers created.');
  }
}

/**
 * Read all existing Business Names from the sheet (column B) and return
 * them as a Set of lowercased strings for O(1) duplicate lookup.
 *
 * @param {Object} sheets
 * @param {string} spreadsheetId
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheetTab}!B:B`,
  });

  const rows = res.data.values || [];
  // Skip header row (index 0)
  return new Set(
    rows.slice(1).map((row) => (row[0] || '').trim().toLowerCase())
  );
}

/**
 * Append new leads to the spreadsheet, skipping duplicates.
 *
 * @param {Array<Object>} leads - Normalized lead objects from apollo.js
 * @returns {Promise<{appended: number, duplicates: number}>}
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in your .env file.');
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets, spreadsheetId);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId);
  console.log(`  → ${existing.size} existing businesses in sheet (duplicate check ready)`);

  // Today's date in MM/DD/YYYY format
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newLeads = leads.filter(
    (lead) => !existing.has(lead.businessName.trim().toLowerCase())
  );

  if (newLeads.length === 0) {
    return { appended: 0, duplicates: leads.length };
  }

  // Build rows in column order matching config.sheetHeaders:
  // Date Added | Business Name | Owner First | Owner Last | Phone | City | Website | Called | Notes
  const rows = newLeads.map((lead) => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank for manual tracking
    '', // Notes  — left blank for manual notes
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${config.sheetTab}!A:${columnLetter(config.sheetHeaders.length)}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return {
    appended: newLeads.length,
    duplicates: leads.length - newLeads.length,
  };
}

/**
 * Convert a 1-based column index to its letter (1→A, 26→Z, 27→AA …).
 *
 * @param {number} n - 1-based column index
 * @returns {string}
 */
function columnLetter(n) {
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = { appendLeads, getAuthClient };
