'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');
const config = require('./config');

// Google Sheets API scope — read + write
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Sheet tab name — change if yours is different
const TAB_NAME = 'Leads';

// ─── OAuth2 helpers ───────────────────────────────────────────────────────────

/**
 * Load OAuth2 client using saved credentials and stored token.
 * On first run, prompts the user to authorize via browser.
 */
async function getAuthClient() {
  const credPath = path.resolve(config.GOOGLE_CREDENTIALS_PATH());
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
        'Download it from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID → Download JSON'
    );
  }

  const rawCreds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  // The JSON may be nested under "installed" or "web" key
  const creds = rawCreds.installed || rawCreds.web || rawCreds;
  const { client_id, client_secret, redirect_uris } = creds;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob'
  );

  const tokenPath = path.resolve(config.GOOGLE_TOKEN_PATH());
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);
    // Refresh if expired
    oAuth2Client.on('tokens', (newTokens) => {
      const merged = { ...token, ...newTokens };
      fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
    });
    return oAuth2Client;
  }

  // First-time authorization flow
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n─────────────────────────────────────────────────────────');
  console.log('Google authorization required.');
  console.log('Open this URL in your browser and paste the code below:\n');
  console.log(authUrl);
  console.log('─────────────────────────────────────────────────────────\n');

  const code = await promptUser('Enter the authorization code: ');
  const { tokens } = await oAuth2Client.getToken(code.trim());
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`\nToken saved to ${tokenPath}`);

  return oAuth2Client;
}

function promptUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ─── Sheet access helpers ─────────────────────────────────────────────────────

/**
 * Read all existing business names from column B to detect duplicates.
 * Returns a Set of lowercase trimmed names.
 */
async function fetchExistingBusinessNames(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = config.GOOGLE_SHEET_ID();

  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      // Column B = "Business Name" (starting at row 2 to skip header)
      range: `${TAB_NAME}!B2:B`,
    });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    throw new Error(`Failed to read Google Sheet (ID: ${sheetId}): ${detail}`);
  }

  const rows = res.data.values || [];
  return new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
}

/**
 * Ensure the sheet has the expected header row.
 * If the sheet is empty, writes the header first.
 */
async function ensureHeader(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = config.GOOGLE_SHEET_ID();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${TAB_NAME}!A1:Z1`,
  });

  const existingHeader = (res.data.values?.[0] || []).map((h) => h.trim());
  const expectedHeader = config.SHEET_COLUMNS;

  if (existingHeader.length === 0) {
    // Sheet is empty — write the header
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${TAB_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [expectedHeader] },
    });
    console.log('  Header row written to sheet.');
    return;
  }

  // Warn if header doesn't match expected (non-fatal — just log it)
  const mismatch = expectedHeader.filter((col) => !existingHeader.includes(col));
  if (mismatch.length) {
    console.warn(
      `  Warning: Sheet header is missing expected columns: ${mismatch.join(', ')}\n` +
        '  Leads will still be appended but column positions may be off.'
    );
  }
}

/**
 * Append an array of lead objects to the sheet.
 *
 * @param {Array}  leads   Normalized lead objects from apollo.js
 * @param {Object} auth    OAuth2 client
 * @returns {number}       Number of rows actually appended
 */
async function appendLeads(leads, auth) {
  if (!leads.length) return 0;

  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = config.GOOGLE_SHEET_ID();
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  // Map each lead to a row in SHEET_COLUMNS order
  const rows = leads.map((lead) => [
    today,                 // Date Added
    lead.businessName,     // Business Name
    lead.firstName,        // Owner First Name
    lead.lastName,         // Owner Last Name
    lead.phone,            // Phone Number
    lead.city,             // City
    lead.website,          // Website
    '',                    // Called — blank
    '',                    // Notes — blank
  ]);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${TAB_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    throw new Error(`Failed to append rows to Google Sheet: ${detail}`);
  }

  return rows.length;
}

/**
 * Lightweight connectivity check — authenticates and reads the sheet header.
 */
async function testConnection() {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({
      spreadsheetId: config.GOOGLE_SHEET_ID(),
      fields: 'properties.title',
    });
    const title = res.data.properties?.title || '(unknown)';
    return { ok: true, message: `Google Sheets connected. Spreadsheet: "${title}"` };
  } catch (err) {
    return { ok: false, message: `Google Sheets connection failed: ${err.message}` };
  }
}

module.exports = { getAuthClient, fetchExistingBusinessNames, ensureHeader, appendLeads, testConnection };
