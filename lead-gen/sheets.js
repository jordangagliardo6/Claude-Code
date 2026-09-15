/**
 * Google Sheets API wrapper.
 *
 * Handles:
 *  - OAuth token refresh automatically via googleapis
 *  - Ensuring the header row exists on first use
 *  - Reading existing business names for duplicate detection
 *  - Appending new lead rows without duplicates
 */

const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');

// Column headers — edit here if you want to rename or reorder columns
const HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // intentionally blank on insert
  'Notes'     // intentionally blank on insert
];

// Spreadsheet tab name — change if your sheet uses a different tab
const SHEET_TAB = 'Sheet1';

/**
 * Build an authenticated Google Sheets client using the saved OAuth token.
 */
function getSheetsClient() {
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, 'credentials.json');
  const tokenPath       = process.env.GOOGLE_TOKEN_PATH       || path.join(__dirname, 'token.json');

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials file not found at ${credentialsPath}.\n` +
      'Run: node setup-auth.js   to complete OAuth setup.'
    );
  }
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Google token file not found at ${tokenPath}.\n` +
      'Run: node setup-auth.js   to authorise this app with your Google account.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const creds       = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0]
  );

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  oAuth2Client.setCredentials(token);

  // Persist any refreshed tokens so the process keeps working unattended
  oAuth2Client.on('tokens', updated => {
    const merged = { ...token, ...updated };
    fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
  });

  return google.sheets({ version: 'v4', auth: oAuth2Client });
}

/**
 * Make sure row 1 has our expected headers.
 * Safe to call on every run — skips the write if headers already match.
 */
async function ensureHeaders(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A1:I1`
  });
  const existing = res.data.values?.[0] || [];
  if (existing.join('|') !== HEADERS.join('|')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] }
    });
    console.log('Header row written.');
  }
}

/**
 * Return a Set of lowercased business names already in the sheet.
 * Used for duplicate detection.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!B2:B` // column B = Business Name, skip header
  });
  const rows = res.data.values || [];
  return new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
}

/**
 * Append new leads to the spreadsheet, skipping any that already exist.
 *
 * @param {Array}  leads          Array of lead objects from apollo.js
 * @returns {Promise<number>}     Number of new rows actually inserted
 */
async function appendLeadsToSheet(leads) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set in your .env file');
  }

  const sheets = getSheetsClient();

  await ensureHeaders(sheets, spreadsheetId);

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId);

  const today = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  const newRows = leads
    .filter(lead => {
      const key = (lead.businessName || '').toLowerCase().trim();
      if (!key) return false;             // skip blanks
      if (existingNames.has(key)) {
        console.log(`  Skipping duplicate: ${lead.businessName}`);
        return false;
      }
      return true;
    })
    .map(lead => [
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',   // Called
      ''    // Notes
    ]);

  if (newRows.length === 0) {
    console.log('No new leads to add — all results were duplicates already in the sheet.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows }
  });

  console.log(`✓ Added ${newRows.length} new lead(s) to the sheet.`);
  return newRows.length;
}

module.exports = { appendLeadsToSheet, HEADERS };
