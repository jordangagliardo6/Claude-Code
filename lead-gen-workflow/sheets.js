/**
 * sheets.js — Google Sheets API client
 *
 * Handles OAuth2 authentication, header initialisation, duplicate checking,
 * and row appending.  On first run it opens a browser auth URL and saves the
 * token locally so every subsequent run is fully unattended.
 *
 * Prerequisites in Google Cloud Console:
 *   1. Enable "Google Sheets API" and "Google Drive API" for your project.
 *   2. Create an OAuth 2.0 Client ID → Desktop Application.
 *   3. Download the JSON → save as  credentials/credentials.json
 *
 * After running "node setup.js" once, credentials/token.json is created
 * automatically and the cron job needs no further interaction.
 */

const { google }  = require('googleapis');
const fs          = require('fs');
const path        = require('path');
const readline    = require('readline');
const config      = require('./config');

// OAuth2 scopes — read + write Sheets; read Drive (for file metadata if needed)
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'credentials.json');
const TOKEN_PATH       = path.join(__dirname, 'credentials', 'token.json');

// Singleton auth client — created once per process lifetime
let _auth = null;

// ── AUTH ──────────────────────────────────────────────────────────────────────

/**
 * Return a ready-to-use OAuth2 client.
 * Reads a saved token if available; otherwise runs the interactive auth flow.
 */
async function getAuthClient() {
  if (_auth) return _auth;

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Missing Google credentials at: ${CREDENTIALS_PATH}\n` +
      `Download your OAuth2 credentials JSON from Google Cloud Console and save it there.\n` +
      `See the README for step-by-step instructions.`
    );
  }

  const raw         = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const creds       = raw.installed || raw.web;
  const { client_secret, client_id, redirect_uris } = creds;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    // Re-use saved token; hook auto-refresh to persist new refresh tokens
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    oAuth2Client.on('tokens', newTokens => {
      if (newTokens.refresh_token) {
        const merged = { ...token, ...newTokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
      }
    });
    _auth = oAuth2Client;
    return _auth;
  }

  // First-time setup: interactive browser flow
  _auth = await runInteractiveAuth(oAuth2Client);
  return _auth;
}

/**
 * Print a browser URL, wait for the user to paste the auth code, then save
 * the resulting token so future runs need no interaction.
 */
async function runInteractiveAuth(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES,
    prompt:      'consent', // force refresh_token on first auth
  });

  console.log('\n════════════════════════════════════════════════════');
  console.log('  GOOGLE ACCOUNT AUTHORISATION REQUIRED');
  console.log('════════════════════════════════════════════════════');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter authorising, Google will show you a code.\n');

  const rl   = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => {
    rl.question('Paste the authorisation code here and press Enter: ', answer => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  // Persist token for all future runs
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\n✓ Token saved to: ${TOKEN_PATH}`);

  return oAuth2Client;
}

// ── SPREADSHEET OPERATIONS ───────────────────────────────────────────────────

/**
 * Write the header row if the sheet is empty.
 * Idempotent — safe to call on every run.
 */
async function ensureHeaders() {
  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = `${config.SHEET_TAB_NAME}!A1:I1`;
  const res   = await sheets.spreadsheets.values.get({
    spreadsheetId: config.GOOGLE_SHEET_ID,
    range,
  });

  const existingRow = res.data.values?.[0] || [];
  if (existingRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId:   config.GOOGLE_SHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody:     { values: [config.SHEET_HEADERS] },
    });
    console.log('[Sheets] Header row initialised.');
  }
}

/**
 * Read column B (Business Name) from every data row and return a lowercase
 * Set for O(1) duplicate checks.
 *
 * @returns {Promise<Set<string>>}
 */
async function getExistingBusinessNames() {
  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.GOOGLE_SHEET_ID,
    range:         `${config.SHEET_TAB_NAME}!B:B`,
  });

  const rows = res.data.values || [];
  // Row index 0 is the header; skip it.
  return new Set(
    rows.slice(1).map(row => (row[0] || '').toLowerCase().trim())
  );
}

/**
 * Append one or more rows to the bottom of the Leads sheet.
 *
 * @param {Array<Array<string>>} rows - Each sub-array is one spreadsheet row.
 */
async function appendRows(rows) {
  if (!rows.length) return;

  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId:   config.GOOGLE_SHEET_ID,
    range:           `${config.SHEET_TAB_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:     { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new row(s).`);
}

/**
 * Convert a normalised lead object into the ordered column array the
 * spreadsheet expects.
 *
 * Column order must match config.SHEET_HEADERS exactly.
 *
 * @param  {Object} lead
 * @param  {string} dateAdded  - Human-readable date string, e.g. "7/15/2026"
 * @returns {Array<string>}
 */
function leadToRow(lead, dateAdded) {
  return [
    dateAdded,         // A: Date Added
    lead.businessName, // B: Business Name
    lead.firstName,    // C: Owner First Name
    lead.lastName,     // D: Owner Last Name
    lead.phone,        // E: Phone Number
    lead.city,         // F: City
    lead.website,      // G: Website
    '',                // H: Called (blank — fill in manually)
    '',                // I: Notes  (blank — fill in manually)
  ];
}

module.exports = {
  getAuthClient,
  ensureHeaders,
  getExistingBusinessNames,
  appendRows,
  leadToRow,
};
