'use strict';
const { google } = require('googleapis');
const fs = require('fs');
const { SHEET_COLUMNS, SHEET_TAB, TIMEZONE } = require('./config');

// Returns an authenticated Google Sheets client.
// Prefers service account auth (best for scheduled automation).
// Falls back to OAuth2 if credentials.json + token.json exist.
function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && fs.existsSync(keyFile)) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  // OAuth2 fallback — requires credentials.json and token.json in the working directory
  if (!fs.existsSync('credentials.json')) {
    throw new Error(
      'No Google auth found. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or run the OAuth setup.'
    );
  }
  const { client_secret, client_id, redirect_uris } =
    (JSON.parse(fs.readFileSync('credentials.json')).installed ||
      JSON.parse(fs.readFileSync('credentials.json')).web);
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync('token.json')));
  return oauth2Client;
}

// Writes column headers to row 1 if the sheet is empty.
async function ensureHeaders(sheets, spreadsheetId) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A1:I1`,
  });
  const existing = (resp.data.values || [[]])[0];
  if (existing.length === 0 || existing[0] !== SHEET_COLUMNS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS] },
    });
    console.log('Sheet headers written.');
  }
}

// Returns a Set of lowercased business names already in column B (for dedup).
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!B2:B`,  // Business Name is column B; skip header row
  });
  const rows = resp.data.values || [];
  return new Set(rows.map(r => (r[0] || '').trim().toLowerCase()));
}

// Builds a single spreadsheet row from a lead object.
// If you add/remove columns in config.js, update this function to match.
function buildRow(lead, dateStr) {
  return [
    dateStr,            // A: Date Added
    lead.businessName,  // B: Business Name
    lead.firstName,     // C: Owner First Name
    lead.lastName,      // D: Owner Last Name
    lead.phone,         // E: Phone Number
    lead.city,          // F: City
    lead.website || '', // G: Website
    '',                 // H: Called (left blank for you to fill in)
    '',                 // I: Notes (left blank)
  ];
}

// Appends an array of lead objects to the sheet.
// Returns the number of rows actually written.
async function appendLeads(sheets, spreadsheetId, leads) {
  if (leads.length === 0) return 0;
  const today = new Date().toLocaleDateString('en-US', { timeZone: TIMEZONE });
  const rows = leads.map(lead => buildRow(lead, today));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
  return rows.length;
}

// Returns an initialized Google Sheets client.
function createSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

module.exports = { createSheetsClient, ensureHeaders, getExistingBusinessNames, appendLeads };
