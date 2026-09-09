/**
 * sheets.js — Google Sheets client
 *
 * Handles OAuth2 authentication and all read/write operations against
 * the lead-tracking spreadsheet.
 *
 * Column layout (1-indexed, A=1):
 *   A  Date Added
 *   B  Business Name       ← duplicate-check column
 *   C  Owner First Name
 *   D  Owner Last Name
 *   E  Phone Number
 *   F  City
 *   G  Website
 *   H  Called              (left blank — user fills in manually)
 *   I  Notes               (left blank — user fills in manually)
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');

// OAuth2 scopes — full Sheets read/write
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Load credentials.json and build an authorized OAuth2 client.
 * On first run this prompts the user for an authorization code.
 * Subsequent runs read the saved token from GOOGLE_TOKEN_PATH.
 *
 * @returns {Promise<import('googleapis').Auth.OAuth2Client>}
 */
async function getAuthClient() {
  const credPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials/credentials.json');
  const tokenPath = path.resolve(process.env.GOOGLE_TOKEN_PATH || './credentials/token.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials not found at ${credPath}.\n` +
      `Download credentials.json from Google Cloud Console → APIs & Services → Credentials.`
    );
  }

  const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(tokenPath)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));
    return oAuth2Client;
  }

  // First-time auth: generate URL and prompt for code
  return promptForToken(oAuth2Client, tokenPath);
}

/**
 * Interactive OAuth flow — only needed on first run.
 */
async function promptForToken(oAuth2Client, tokenPath) {
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\n─────────────────────────────────────────────────────');
  console.log('  GOOGLE AUTHORIZATION REQUIRED (first run only)');
  console.log('─────────────────────────────────────────────────────');
  console.log('1. Open this URL in your browser:\n');
  console.log('  ', authUrl);
  console.log('\n2. Sign in and click Allow.');
  console.log('3. Copy the authorization code shown and paste it here.\n');

  const code = await prompt('Enter the authorization code: ');

  const { tokens } = await oAuth2Client.getToken(code.trim());
  oAuth2Client.setCredentials(tokens);
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(tokens));
  console.log(`\nToken saved to ${tokenPath} — you won't need to do this again.\n`);
  return oAuth2Client;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

// ── Sheet operations ─────────────────────────────────────────────────────────

/**
 * Ensure the header row exists in the sheet. Safe to call on every run —
 * it only writes if A1 is empty.
 */
async function ensureHeaders(sheets, spreadsheetId, tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:I1`,
  });

  const firstCell = res.data.values?.[0]?.[0];
  if (!firstCell) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name', 'Phone Number', 'City', 'Website', 'Called', 'Notes']],
      },
    });
    console.log('  Header row created.');
  }
}

/**
 * Read all existing business names from column B (case-insensitive).
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames(sheets, spreadsheetId, tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!B2:B`,
  });

  const names = new Set();
  for (const row of res.data.values || []) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }
  return names;
}

/**
 * Append an array of lead objects as new rows.
 *
 * @param {Array<object>} leads  Each lead: { businessName, firstName, lastName, phone, city, website }
 * @returns {Promise<number>} Number of rows appended
 */
async function appendLeads(sheets, spreadsheetId, tab, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  const rows = leads.map((l) => [
    today,             // A: Date Added
    l.businessName,    // B: Business Name
    l.firstName,       // C: Owner First Name
    l.lastName,        // D: Owner Last Name
    l.phone,           // E: Phone Number
    l.city,            // F: City
    l.website,         // G: Website
    '',                // H: Called (user fills in)
    '',                // I: Notes (user fills in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return leads.length;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Full read-check-append cycle.
 *
 * @param {Array<object>} newLeads  Leads from Apollo (already globally deduped)
 * @returns {Promise<number>} Rows written
 */
async function writeLeadsToSheet(newLeads) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in environment variables.');
  }

  await ensureHeaders(sheets, spreadsheetId, tab);
  const count = await appendLeads(sheets, spreadsheetId, tab, newLeads);
  return count;
}

/**
 * Read existing names — used by the main orchestrator before calling Apollo
 * so we can pass them as an exclusion set to the search.
 */
async function readExistingNames() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in environment variables.');
  }

  return getExistingBusinessNames(sheets, spreadsheetId, tab);
}

/**
 * Lightweight connectivity test — read the first row only.
 */
async function testConnection() {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A1:I1`,
    });

    const header = res.data.values?.[0] || [];
    return { ok: true, message: `Google Sheets connected — found ${header.length} column(s) in header row.` };
  } catch (err) {
    return { ok: false, message: `Google Sheets connection failed: ${err.message}` };
  }
}

module.exports = { readExistingNames, writeLeadsToSheet, testConnection };
