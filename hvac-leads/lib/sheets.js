'use strict';

/**
 * Google Sheets integration via OAuth2.
 *
 * First-time setup:
 *   1. Save your OAuth2 client JSON from Google Cloud Console as
 *      hvac-leads/credentials/google-oauth-client.json
 *   2. Run:  npm run authorize
 *      A browser tab opens; sign in and approve. The refresh token is saved to
 *      hvac-leads/credentials/google-token.json automatically.
 *   3. All subsequent runs (including the cron job) use the saved token silently.
 *
 * Target spreadsheet column layout (must not change order):
 *   A: Date Added  B: Business Name  C: Owner First Name  D: Owner Last Name
 *   E: Phone Number  F: City  G: Website  H: Called  I: Notes
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

// ── Config ──────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8';
const SHEET_RANGE = 'A:I';  // columns A through I on the first (default) sheet

// Column index of "Business Name" used for duplicate checking (0-based = column B)
const BUSINESS_NAME_COL = 1;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getClientFilePath() {
  return path.resolve(process.env.GOOGLE_OAUTH_CLIENT_FILE || './credentials/google-oauth-client.json');
}

function getTokenFilePath() {
  return path.resolve(process.env.GOOGLE_TOKEN_FILE || './credentials/google-token.json');
}

/**
 * Build an authorized Google Sheets client.
 * Loads OAuth2 credentials from disk; throws if not yet authorized.
 */
async function getAuthClient() {
  const clientFile = getClientFilePath();
  if (!fs.existsSync(clientFile)) {
    throw new Error(
      `Google OAuth client file not found at: ${clientFile}\n` +
      'See .env.example for setup instructions.'
    );
  }

  const { client_id, client_secret, redirect_uris } =
    JSON.parse(fs.readFileSync(clientFile)).installed ||
    JSON.parse(fs.readFileSync(clientFile)).web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const tokenFile = getTokenFilePath();
  if (!fs.existsSync(tokenFile)) {
    throw new Error(
      'Google token not found. Run  npm run authorize  to complete one-time OAuth setup.'
    );
  }

  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenFile)));
  return oAuth2Client;
}

/**
 * Run the one-time interactive OAuth2 authorization flow.
 * Opens a browser URL; user pastes back the code. Saves the token to disk.
 */
async function authorize() {
  const clientFile = getClientFilePath();
  if (!fs.existsSync(clientFile)) {
    throw new Error(
      `Cannot authorize — OAuth client file missing: ${clientFile}\n\n` +
      'Steps:\n' +
      '  1. Go to https://console.cloud.google.com\n' +
      '  2. Create (or select) a project\n' +
      '  3. APIs & Services → Enable "Google Sheets API"\n' +
      '  4. Credentials → Create OAuth 2.0 Client ID (Desktop App)\n' +
      '  5. Download JSON → save as  hvac-leads/credentials/google-oauth-client.json\n' +
      '  6. Run  npm run authorize  again'
    );
  }

  const { client_id, client_secret, redirect_uris } =
    JSON.parse(fs.readFileSync(clientFile)).installed ||
    JSON.parse(fs.readFileSync(clientFile)).web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n─────────────────────────────────────────────');
  console.log('Google OAuth2 Authorization');
  console.log('─────────────────────────────────────────────');
  console.log('1. Open this URL in your browser:\n');
  console.log('   ', authUrl);
  console.log('\n2. Sign in and approve access to Google Sheets.');
  console.log('3. Copy the authorization code from the browser.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('Paste the code here: ', resolve));
  rl.close();

  const { tokens } = await oAuth2Client.getToken(code.trim());
  oAuth2Client.setCredentials(tokens);

  const tokenFile = getTokenFilePath();
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
  console.log(`\nToken saved to: ${tokenFile}`);
  console.log('Authorization complete. You can now run  npm run now  or  npm start.\n');
}

/**
 * Read column B from all existing rows and return a Set of lowercase
 * business names, used to prevent duplicate inserts.
 */
async function getExistingBusinessNames() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `B:B`,  // only the Business Name column
  });

  const rows = res.data.values || [];
  const names = new Set();

  for (const row of rows) {
    const name = (row[0] || '').trim().toLowerCase();
    if (name && name !== 'business name') names.add(name);  // skip header
  }

  return names;
}

/**
 * Format today's date as YYYY-MM-DD in Eastern Time.
 */
function todayEastern() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Append an array of lead objects as new rows to the spreadsheet.
 * Each lead must have: businessName, ownerFirstName, ownerLastName,
 *                      phone, city, website
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) return;

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const today = todayEastern();

  // Build rows in the exact column order A–I
  const rows = leads.map(lead => [
    today,                    // A: Date Added
    lead.businessName || '',  // B: Business Name
    lead.ownerFirstName || '', // C: Owner First Name
    lead.ownerLastName || '', // D: Owner Last Name
    lead.phone || '',         // E: Phone Number
    lead.city || '',          // F: City
    lead.website || '',       // G: Website
    '',                       // H: Called (blank)
    '',                       // I: Notes (blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: rows },
  });
}

/**
 * Smoke-test the Sheets connection: read the header row.
 * Throws on auth or permission error so the caller can surface it at startup.
 */
async function verifySheetsConnection() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'A1:I1',
  });

  const header = (res.data.values || [[]])[0] || [];
  return header;
}

module.exports = { getExistingBusinessNames, appendLeads, authorize, verifySheetsConnection };
