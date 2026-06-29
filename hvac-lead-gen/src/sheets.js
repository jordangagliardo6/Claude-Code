/**
 * sheets.js — Google Sheets read/write via googleapis
 *
 * Handles OAuth2 authorization (interactive on first run, auto-refreshed after),
 * ensures the header row exists, checks for duplicates, and appends new lead rows.
 *
 * To change the sheet tab name, update SHEET_NAME in .env.
 * To add or reorder columns, update COLUMNS below and match the row builder in appendLeads().
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column headers — must match the row array order in appendLeads()
const COLUMNS = [
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

/**
 * Returns an authenticated Google OAuth2 client.
 * On first run, opens a browser authorization URL and prompts for the code.
 * On subsequent runs, loads the saved token and auto-refreshes it when needed.
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Google credentials file not found at: ${CREDENTIALS_PATH}\n` +
        'Follow the setup guide: run `node src/verify.js` for step-by-step instructions.'
    );
  }

  const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const credentials = JSON.parse(raw);
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Persist refreshed tokens automatically
  oAuth2Client.on('tokens', (tokens) => {
    try {
      const existing = fs.existsSync(TOKEN_PATH)
        ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
        : {};
      const merged = { ...existing, ...tokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    } catch (_) {
      // Non-fatal; token will be refreshed again next run
    }
  });

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // First-time interactive authorization
  return authorizeInteractively(oAuth2Client);
}

/**
 * Guides the user through the one-time Google OAuth2 consent flow.
 * Saves the resulting token to disk so future runs are non-interactive.
 */
async function authorizeInteractively(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // force refresh_token to be returned
  });

  console.log('\n─────────────────────────────────────────────────────');
  console.log('GOOGLE SHEETS AUTHORIZATION REQUIRED');
  console.log('Open this URL in your browser and authorize access:\n');
  console.log(authUrl);
  console.log('─────────────────────────────────────────────────────\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) =>
    rl.question('Paste the authorization code from the browser here: ', resolve)
  );
  rl.close();

  const { tokens } = await oAuth2Client.getToken(code.trim());
  oAuth2Client.setCredentials(tokens);

  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('\nAuthorization successful! Token saved to', TOKEN_PATH);

  return oAuth2Client;
}

/**
 * Ensures row 1 of the sheet contains the expected column headers.
 * Safe to call on an existing sheet — only writes if the header row is empty.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:${columnLetter(COLUMNS.length)}1`,
  });

  const firstRow = res.data.values?.[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('Header row written to sheet.');
  }
}

/**
 * Reads all values in column B (Business Name) and returns them as a
 * lowercase Set for fast duplicate checking.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,
  });

  const rows = res.data.values || [];
  // Slice(1) skips the header row
  return new Set(rows.slice(1).map((r) => (r[0] || '').toLowerCase().trim()));
}

/**
 * Appends new leads to the spreadsheet, skipping any whose Business Name
 * already exists in the sheet.
 *
 * @param {Array} leads — array of lead objects from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID environment variable is not set.');

  const sheetName = process.env.SHEET_NAME || 'Sheet1';

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key) {
      skipped++;
      continue;
    }
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    // Add to local set so same-run duplicates are also caught
    existing.add(key);

    // Row order must match COLUMNS above
    newRows.push([
      today,            // Date Added
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',               // Called (intentionally blank)
      '',               // Notes (intentionally blank)
    ]);
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:${columnLetter(COLUMNS.length)}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

/** Converts a 1-based column index to a spreadsheet letter (1→A, 9→I). */
function columnLetter(n) {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

module.exports = { appendLeads, getAuthClient };
