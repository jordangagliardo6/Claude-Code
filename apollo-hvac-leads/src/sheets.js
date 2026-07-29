/**
 * sheets.js — Read existing entries and append new leads to Google Sheets.
 *
 * Sheet column layout (do NOT change column order without updating the
 * ROW_TEMPLATE array at the bottom of this file):
 *
 *   A: Date Added   B: Business Name   C: Owner First Name   D: Owner Last Name
 *   E: Phone Number F: City            G: Website            H: Called (blank)
 *   I: Notes (blank)
 *
 * Dedup key: Business Name (column B), case-insensitive.
 */

const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');

const SCOPES          = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH      = path.join(__dirname, '..', 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

/**
 * Build an authorised Google OAuth2 client from the stored token.
 * Throws a helpful message if credentials or token are missing.
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials.json not found. Download it from Google Cloud Console → APIs & Services → Credentials ' +
      'and place it in the apollo-hvac-leads/ directory.'
    );
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const cfg = raw.installed ?? raw.web;

  if (!cfg) {
    throw new Error(
      'credentials.json has an unexpected format. ' +
      'It should contain an "installed" or "web" key.'
    );
  }

  const oAuth2Client = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    cfg.redirect_uris[0]
  );

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      'token.json not found. Run "npm run authorize" once to authenticate with Google.'
    );
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oAuth2Client.setCredentials(token);

  // Auto-refresh the token if it has expired.
  oAuth2Client.on('tokens', updated => {
    if (updated.refresh_token) {
      const merged = { ...token, ...updated };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    }
  });

  return oAuth2Client;
}

/**
 * Read all values in column B (Business Name) and return a lowercased Set
 * for O(1) dedup lookups.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,
  });

  const rows = res.data.values ?? [];
  // Row 0 is the header — skip it.
  return new Set(
    rows
      .slice(1)
      .map(r => (r[0] ?? '').toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Append new leads to the sheet, skipping duplicates.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 * @returns {Promise<{written: number, skipped: number}>}
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName     = process.env.SHEET_NAME ?? 'Leads';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set in your .env file.');
  }

  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day:   '2-digit',
    year:  'numeric',
  });

  const newRows = [];
  const skippedNames = [];

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();

    if (!key) continue; // skip leads with no company name

    if (existing.has(key)) {
      skippedNames.push(lead.businessName);
      continue;
    }

    // Mark as seen so within-batch duplicates are also deduplicated.
    existing.add(key);

    newRows.push([
      today,             // A: Date Added
      lead.businessName, // B: Business Name
      lead.firstName,    // C: Owner First Name
      lead.lastName,     // D: Owner Last Name
      lead.phone,        // E: Phone Number
      lead.city,         // F: City
      lead.website,      // G: Website
      '',                // H: Called  — leave blank for you to fill in
      '',                // I: Notes   — leave blank for you to fill in
    ]);
  }

  if (skippedNames.length) {
    console.log(`Skipped ${skippedNames.length} duplicate(s): ${skippedNames.join(', ')}`);
  }

  if (newRows.length === 0) {
    return { written: 0, skipped: skippedNames.length };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:            `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: newRows },
  });

  return { written: newRows.length, skipped: skippedNames.length };
}

module.exports = { appendLeads };
