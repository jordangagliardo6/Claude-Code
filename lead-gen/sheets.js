'use strict';
const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH       = path.join(__dirname, 'token.json');

// Column headers the script writes (must match your spreadsheet exactly)
// A   B              C                  D                 E             F     G        H       I
// Date | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set. Add it to your .env file.');
  return id;
}

function getSheetTab() {
  return process.env.SHEET_TAB_NAME || 'Leads';
}

/**
 * Builds an authenticated OAuth2 client using stored token.json.
 * Tokens are refreshed automatically and written back to disk.
 */
function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `${CREDENTIALS_PATH} not found.\n` +
      'Download OAuth2 credentials from Google Cloud Console and save as credentials.json.\n' +
      'Then run: npm run authorize'
    );
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      `${TOKEN_PATH} not found.\n` +
      'Run: npm run authorize   (one-time step to log in with your Google account)'
    );
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  auth.setCredentials(token);

  // Persist refreshed tokens so the scheduler never needs re-authorization
  auth.on('tokens', updated => {
    const stored = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    if (updated.refresh_token) stored.refresh_token = updated.refresh_token;
    stored.access_token = updated.access_token;
    stored.expiry_date  = updated.expiry_date;
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(stored, null, 2));
  });

  return auth;
}

/**
 * Returns a Set of normalized business names already in column B (row 2+).
 * Used to skip duplicates before writing.
 */
async function getExistingBusinessNames() {
  const auth         = getAuthClient();
  const sheets       = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId();
  const tab          = getSheetTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.map(r => normalize(r[0] || '')));
}

/**
 * Appends an array of lead objects as new rows at the bottom of the sheet.
 * Columns: Date Added | Business Name | First | Last | Phone | City | Website | Called | Notes
 */
async function appendLeads(leads) {
  const auth          = getAuthClient();
  const sheets        = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId();
  const tab           = getSheetTab();

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const rows = leads.map(lead => [
    today,             // A: Date Added
    lead.businessName, // B: Business Name
    lead.firstName,    // C: Owner First Name
    lead.lastName,     // D: Owner Last Name
    lead.phone,        // E: Phone Number
    lead.city,         // F: City
    lead.website,      // G: Website
    '',                // H: Called (blank — you fill this in)
    '',                // I: Notes  (blank — you fill this in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Writes the header row to row 1 if the sheet is completely empty.
 * Safe to call on every run — skips if headers already exist.
 */
async function ensureHeaders() {
  const auth          = getAuthClient();
  const sheets        = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId();
  const tab           = getSheetTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:I1`,
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length > 0) return; // headers already there

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
        'Phone Number', 'City', 'Website', 'Called', 'Notes',
      ]],
    },
  });

  console.log('[sheets] Header row written.');
}

function normalize(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

module.exports = { getExistingBusinessNames, appendLeads, ensureHeaders };
