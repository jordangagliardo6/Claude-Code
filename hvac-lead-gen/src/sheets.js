// Google Sheets integration using OAuth2 (googleapis package)
// First run will prompt you to authorize via browser; token is saved locally.
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const logger = require('./logger');

const CREDENTIALS_PATH = path.join(__dirname, '../credentials/credentials.json');
const TOKEN_PATH = path.join(__dirname, '../credentials/token.json');

// Read/write scope — change to readonly if you ever need a read-only mode
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── Column layout ────────────────────────────────────────────────────────────
// Adjust this object if you ever need to reorder or rename columns.
const HEADERS = [
  'Date Added',       // A
  'Business Name',    // B  ← duplicate-check column
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank)
  'Notes',            // I  (left blank)
];

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Google credentials not found at ${CREDENTIALS_PATH}.\n` +
      `Download credentials.json from Google Cloud Console and place it there.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed ?? credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    // Refresh automatically when the token expires
    oAuth2Client.on('tokens', refreshed => {
      const stored = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...stored, ...refreshed }, null, 2));
    });
    return oAuth2Client;
  }

  return _authorizeInteractively(oAuth2Client);
}

async function _authorizeInteractively(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  Google Sheets Authorization Required');
  console.log('════════════════════════════════════════════════════════');
  console.log('\n  1. Open this URL in your browser:\n');
  console.log(`     ${authUrl}\n`);
  console.log('  2. Sign in and click "Allow".');
  console.log('  3. Copy the authorization code shown and paste it below.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve, reject) => {
    rl.question('  Paste authorization code: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code.trim(), (err, token) => {
        if (err) {
          reject(new Error(`Failed to exchange auth code: ${err.message}`));
          return;
        }
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
        logger.info(`Authorization token saved to ${TOKEN_PATH}`);
        console.log('\n  Authorization successful! Token saved.\n');
        resolve(oAuth2Client);
      });
    });
  });
}

// ─── Spreadsheet operations ───────────────────────────────────────────────────

/**
 * Write header row if the sheet is empty or headers are missing.
 */
async function ensureHeaders(auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:${columnLetter(HEADERS.length)}1`,
  });

  const existing = res.data.values?.[0] ?? [];
  if (existing[0] === HEADERS[0]) return; // Already has headers

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS] },
  });
  logger.info('Header row written to spreadsheet');
}

/**
 * Read all values in the Business Name column (B) and return a lowercase Set
 * for fast O(1) duplicate lookups.
 */
async function getExistingBusinessNames(auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B2:B`, // Skip header row
  });

  const values = (res.data.values ?? []).flat();
  return new Set(values.map(v => v.toLowerCase().trim()));
}

/**
 * Append leads to the spreadsheet, skipping any whose Business Name already
 * exists. Returns the number of rows actually added.
 *
 * @param {object} auth          - OAuth2 client from getAuthClient()
 * @param {string} spreadsheetId - Google Sheets ID from .env
 * @param {Array}  leads         - Array of transformed lead objects from Apollo
 * @returns {Promise<number>}    - Count of new rows added
 */
async function appendLeads(auth, spreadsheetId, leads) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  const existingNames = await getExistingBusinessNames(auth, spreadsheetId);
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key) {
      logger.warn('Skipping lead with no business name');
      continue;
    }
    if (existingNames.has(key)) {
      logger.info(`Duplicate skipped: "${lead.businessName}"`);
      continue;
    }
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called
      '', // Notes
    ]);
    existingNames.add(key); // Guard against duplicates within the same batch
  }

  if (newRows.length === 0) {
    logger.info('No new unique leads to append');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:${columnLetter(HEADERS.length)}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.info(`Appended ${newRows.length} new lead(s) to spreadsheet`);
  return newRows.length;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

// Convert 1-based column index to letter (1→A, 9→I, etc.)
function columnLetter(n) {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

module.exports = { getAuthClient, ensureHeaders, appendLeads };
