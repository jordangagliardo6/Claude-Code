'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const open = (...args) => import('open').then(({ default: o }) => o(...args));

// Paths to OAuth credential files
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'token.json');

// Google Sheets API scopes
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column order that must match the spreadsheet exactly
const COLUMNS = [
  'Date Added',      // A
  'Business Name',   // B
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H — leave blank
  'Notes',           // I — leave blank
];

/**
 * Loads OAuth2 credentials from credentials.json, returns an authorized client.
 * On first run (no token.json), opens the browser for the user to authorize.
 * Subsequent runs reuse the saved token (auto-refreshes when expired).
 */
async function authorize() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials.json not found at ' + CREDENTIALS_PATH + '\n' +
      'See SETUP.md step 2 for how to download it from Google Cloud Console.'
    );
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Reuse saved token if it exists
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    auth.setCredentials(token);

    // Refresh if expired (googleapis handles this automatically, but be explicit)
    if (token.expiry_date && token.expiry_date < Date.now()) {
      console.log('  OAuth token expired — refreshing...');
      const { credentials } = await auth.refreshAccessToken();
      auth.setCredentials(credentials);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials));
    }

    return auth;
  }

  // First-time authorization — open browser
  return getNewToken(auth);
}

/**
 * Opens the browser OAuth flow and saves the resulting token to disk.
 */
async function getNewToken(auth) {
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  GOOGLE AUTHORIZATION REQUIRED');
  console.log('  Opening your browser. Authorize the app, then paste the');
  console.log('  authorization code below.');
  console.log('  Auth URL:', authUrl);
  console.log('══════════════════════════════════════════════════════════\n');

  await open(authUrl).catch(() => {
    // Browser may not open in headless environments
    console.log('  (Could not open browser automatically — copy the URL above)');
  });

  // Read the code from stdin
  const code = await new Promise((resolve) => {
    process.stdout.write('  Paste the authorization code here: ');
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.trim());
    });
  });

  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log('  Token saved to', TOKEN_PATH);
  return auth;
}

/**
 * Returns the Google Sheets API client.
 */
async function getSheetsClient() {
  const auth = await authorize();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Reads all existing Business Names from the sheet (column B, lowercased)
 * so we can skip duplicates before appending.
 *
 * @returns {Set<string>} lowercase business names already in the sheet
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  // Read column B only (Business Name) starting at row 2 (skip header)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!B2:B`,
  });

  const rows = res.data.values || [];
  const names = new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
  return names;
}

/**
 * Ensures the header row exists in the spreadsheet.
 * Only writes it if row 1 is empty.
 */
async function ensureHeaders(sheets) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:I1`,
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tab}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('  Header row written to sheet');
  }
}

/**
 * Appends an array of lead objects to the Google Sheet.
 *
 * @param {Array<{businessName, firstName, lastName, phone, city, website}>} leads
 */
async function appendToSheet(leads) {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  await ensureHeaders(sheets);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Build rows in the exact column order
  const rows = leads.map((lead) => [
    today,              // A: Date Added
    lead.businessName,  // B: Business Name
    lead.firstName,     // C: Owner First Name
    lead.lastName,      // D: Owner Last Name
    lead.phone,         // E: Phone Number
    lead.city,          // F: City
    lead.website,       // G: Website
    '',                 // H: Called (blank)
    '',                 // I: Notes (blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

module.exports = { authorize, getExistingBusinessNames, appendToSheet };
