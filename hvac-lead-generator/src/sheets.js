const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH       = path.join(process.cwd(), 'token.json');
const SCOPES           = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── Column layout — edit this object to reorder or rename columns ────────────
// Index corresponds to the spreadsheet column (0 = A, 1 = B, …)
const COLUMNS = {
  DATE_ADDED:    0,  // A
  BUSINESS_NAME: 1,  // B
  FIRST_NAME:    2,  // C
  LAST_NAME:     3,  // D
  PHONE:         4,  // E
  CITY:          5,  // F
  WEBSITE:       6,  // G
  CALLED:        7,  // H — left blank for manual use
  NOTES:         8,  // I — left blank for manual use
};

const HEADER_ROW = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getAuthClient() {
  let creds;
  try {
    const raw = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    creds = JSON.parse(raw);
  } catch {
    throw new Error(
      'credentials.json not found. Download your OAuth client credentials from Google Cloud Console\n' +
      'and save the file as credentials.json in the hvac-lead-generator/ directory.\n' +
      'See the setup guide for step-by-step instructions.'
    );
  }

  const { client_id, client_secret, redirect_uris } =
    creds.installed ?? creds.web;

  const oauth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Try loading a saved token
  try {
    const tokenRaw = await fs.readFile(TOKEN_PATH, 'utf8');
    const tokenData = JSON.parse(tokenRaw);
    oauth2.setCredentials(tokenData);

    // Proactively refresh if within 5 minutes of expiry
    if (tokenData.expiry_date && tokenData.expiry_date - Date.now() < 5 * 60 * 1000) {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      await fs.writeFile(TOKEN_PATH, JSON.stringify(credentials));
    }

    return oauth2;
  } catch {
    // No token yet — run the one-time browser auth flow
    return authorizeNewToken(oauth2);
  }
}

async function authorizeNewToken(oauth2) {
  const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\n══════════════════════════════════════════════════');
  console.log('  GOOGLE AUTHORIZATION REQUIRED (one-time setup)');
  console.log('══════════════════════════════════════════════════');
  console.log('\n1. Open this URL in your browser:\n');
  console.log(`   ${authUrl}\n`);
  console.log('2. Sign in and click Allow.');
  console.log('3. Copy the authorization code shown on screen.');
  console.log('══════════════════════════════════════════════════\n');

  const code = await promptLine('Paste the authorization code here: ');
  const { tokens } = await oauth2.getToken(code.trim());
  oauth2.setCredentials(tokens);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
  console.log('\nAuthorization successful — token.json saved. You will not need to do this again.\n');
  return oauth2;
}

function promptLine(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

// ─── Sheet operations ─────────────────────────────────────────────────────────

async function getSheetsClient() {
  const auth = await getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const existing = res.data.values;
  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    console.log(`Added header row to "${sheetName}" tab.`);
  }
}

async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,  // Business Name column
  });

  const rows = res.data.values ?? [];
  // Skip row 0 (header), lowercase everything for case-insensitive comparison
  return new Set(
    rows.slice(1)
      .map(row => row[0]?.toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Append new leads to the Google Sheet, skipping duplicates.
 *
 * @param {Array} leads - Normalized lead objects from apollo.js
 * @returns {Promise<number>} Number of rows actually added
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName     = process.env.SHEET_NAME || 'Sheet1';

  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');

  const sheets = await getSheetsClient();

  await ensureHeaders(sheets, spreadsheetId, sheetName);

  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'America/New_York',
  });

  const newRows          = [];
  const skippedDuplicates = [];

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (existingNames.has(key)) {
      skippedDuplicates.push(lead.businessName);
      continue;
    }

    // Build the row in the column order defined above
    const row = new Array(HEADER_ROW.length).fill('');
    row[COLUMNS.DATE_ADDED]    = today;
    row[COLUMNS.BUSINESS_NAME] = lead.businessName;
    row[COLUMNS.FIRST_NAME]    = lead.firstName;
    row[COLUMNS.LAST_NAME]     = lead.lastName;
    row[COLUMNS.PHONE]         = lead.phone;
    row[COLUMNS.CITY]          = lead.city;
    row[COLUMNS.WEBSITE]       = lead.website;
    row[COLUMNS.CALLED]        = '';
    row[COLUMNS.NOTES]         = '';

    newRows.push(row);
    existingNames.add(key); // guard against within-batch duplicates
  }

  if (skippedDuplicates.length > 0) {
    console.log(`  Skipped ${skippedDuplicates.length} duplicate(s): ${skippedDuplicates.join(', ')}`);
  }

  if (newRows.length === 0) return 0;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return newRows.length;
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnection() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) return { success: false, message: 'GOOGLE_SPREADSHEET_ID is not set' };

  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title',
    });
    const title = res.data.properties?.title ?? 'Unknown';
    return { success: true, message: `Google Sheets connection successful — spreadsheet: "${title}"` };
  } catch (error) {
    if (error.code === 404) return { success: false, message: 'Spreadsheet not found — check GOOGLE_SPREADSHEET_ID' };
    if (error.code === 403) return { success: false, message: 'Permission denied — ensure your Google account has access to the spreadsheet' };
    return { success: false, message: `Google Sheets connection failed: ${error.message}` };
  }
}

module.exports = { appendLeads, testConnection, COLUMNS, HEADER_ROW };
