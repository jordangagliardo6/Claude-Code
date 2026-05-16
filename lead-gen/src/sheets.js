const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function loadCredentials() {
  const credPath = path.resolve(config.googleCredentialsPath);
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `credentials.json not found at ${credPath}.\n` +
        'Download it from Google Cloud Console → APIs & Services → Credentials.'
    );
  }
  return JSON.parse(fs.readFileSync(credPath, 'utf8'));
}

function loadToken() {
  const tokenPath = path.resolve(config.googleTokenPath);
  if (!fs.existsSync(tokenPath)) return null;
  return JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
}

/**
 * Build an authenticated OAuth2 client from saved credentials + token.
 * Throws a helpful error if token.json is missing (user hasn't run `npm run auth` yet).
 */
function getAuthClient() {
  const creds = loadCredentials();
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const token = loadToken();
  if (!token) {
    throw new Error(
      'Google token not found. Run `npm run auth` first to authorize your Google account.'
    );
  }

  auth.setCredentials(token);

  // Auto-refresh the access token and persist it
  auth.on('tokens', (newTokens) => {
    const merged = { ...token, ...newTokens };
    fs.writeFileSync(path.resolve(config.googleTokenPath), JSON.stringify(merged, null, 2));
  });

  return auth;
}

// ─── Sheets operations ────────────────────────────────────────────────────────

/**
 * Ensure the target sheet exists and has the correct header row.
 * If the sheet is completely empty, write the header row automatically.
 */
async function ensureHeaders(sheetsApi) {
  const sheetId = config.sheets.spreadsheetId;
  const sheetName = config.sheets.sheetName;

  // Read the first row to check for headers
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1:Z1`,
  });

  const firstRow = res.data.values?.[0] || [];

  if (firstRow.length === 0) {
    // Sheet is empty — write headers
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.sheets.headers] },
    });
    console.log('  Header row written to sheet.');
  }
}

/**
 * Return a Set of lowercase business names already in the spreadsheet.
 * Used to skip duplicates before appending.
 */
async function getExistingBusinessNames(sheetsApi) {
  const sheetId = config.sheets.spreadsheetId;
  const sheetName = config.sheets.sheetName;
  const colLetter = columnLetter(config.sheets.businessNameColIndex);

  // Skip row 1 (header) — read from row 2 onwards
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!${colLetter}2:${colLetter}10000`,
  });

  const names = new Set();
  (res.data.values || []).forEach(([name]) => {
    if (name) names.add(name.toLowerCase().trim());
  });

  return names;
}

/**
 * Append an array of lead objects as new rows at the bottom of the sheet.
 * Returns the number of rows actually written.
 */
async function appendLeads(sheetsApi, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  const rows = leads.map((lead) => [
    today,               // Date Added
    lead.businessName,   // Business Name
    lead.firstName,      // Owner First Name
    lead.lastName,       // Owner Last Name
    lead.phone,          // Phone Number
    lead.city,           // City
    lead.website,        // Website
    '',                  // Called (blank)
    '',                  // Notes (blank)
  ]);

  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${config.sheets.sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * High-level function: authenticate, deduplicate, and append new leads.
 *
 * @param {Array}  leads   Contacts returned by fetchLeads()
 * @returns {{ written: number, skipped: number }}
 */
async function writeleadsToSheet(leads) {
  const auth = getAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheetsApi);

  const existingNames = await getExistingBusinessNames(sheetsApi);
  console.log(`  Sheet has ${existingNames.size} existing businesses.`);

  const newLeads = leads.filter(
    (l) => !existingNames.has(l.businessName.toLowerCase().trim())
  );

  const skipped = leads.length - newLeads.length;
  if (skipped > 0) {
    console.log(`  Skipping ${skipped} duplicate(s).`);
  }

  const written = await appendLeads(sheetsApi, newLeads);
  return { written, skipped };
}

/**
 * Quick connectivity test — verifies credentials, token, and spreadsheet access.
 */
async function testConnection() {
  const auth = getAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth });

  const res = await sheetsApi.spreadsheets.get({
    spreadsheetId: config.sheets.spreadsheetId,
    fields: 'properties.title',
  });

  return res.data.properties?.title || '(untitled)';
}

// ─── Utility ──────────────────────────────────────────────────────────────────

// Convert zero-based column index to letter: 0→A, 1→B, 25→Z, 26→AA
function columnLetter(index) {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

module.exports = { writeleadsToSheet, testConnection };
