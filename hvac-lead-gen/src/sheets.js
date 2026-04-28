const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');
const logger = require('./logger');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'credentials.json');
const TOKEN_PATH        = path.join(__dirname, '..', 'credentials', 'token.json');

// Column header row — edit this array if you ever need to add/rename columns.
// The order here maps 1-to-1 with the columns written in appendLeads().
const HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank for manual use
  'Notes',    // left blank for manual use
];

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Build an authorized OAuth2 client from saved credentials and token files.
 * Run `npm run auth-google` once to generate token.json.
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `credentials.json not found at ${CREDENTIALS_PATH}\n` +
      `Run: npm run auth-google   (see README for Google Cloud setup steps)`
    );
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      `token.json not found at ${TOKEN_PATH}\n` +
      `Run: npm run auth-google`
    );
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const oauth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oauth2.setCredentials(token);

  // Persist refreshed tokens so the app keeps working without re-auth
  oauth2.on('tokens', updated => {
    const merged = { ...token, ...updated };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    logger.info('Google OAuth token refreshed and saved');
  });

  return oauth2;
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID is not set in your .env file');
  return id;
}

function getTabName() {
  return process.env.GOOGLE_SHEET_TAB || 'Sheet1';
}

/** Qualify a range with the tab name so it works even on multi-tab spreadsheets. */
function range(r) {
  return `'${getTabName()}'!${r}`;
}

/**
 * If row 1 is empty or missing the expected header, write HEADERS there.
 * Safe to call on every run — skips if headers are already correct.
 */
async function ensureHeaders() {
  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = getSheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: range(`A1:${colLetter(HEADERS.length)}1`),
  });

  const firstRow = res.data.values?.[0] || [];
  if (firstRow[0] === HEADERS[0]) return; // already set up

  logger.info('Writing column headers to spreadsheet row 1...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: range(`A1:${colLetter(HEADERS.length)}1`),
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });
  logger.info('Headers written');
}

/**
 * Return a Set of lowercase business names already in column B (skips header).
 * Used for duplicate detection before appending.
 */
async function getExistingBusinessNames() {
  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: range('B:B'),
  });

  const rows  = res.data.values || [];
  const names = new Set();
  // rows[0] is the header — skip it
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]?.[0]) names.add(rows[i][0].toLowerCase().trim());
  }

  logger.info(`Found ${names.size} existing business names in sheet`);
  return names;
}

/**
 * Append an array of lead objects as new rows at the bottom of the sheet.
 * Returns the number of rows actually written.
 *
 * Lead shape expected:
 *   { businessName, firstName, lastName, phone, city, website }
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) return 0;

  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  // Each row mirrors HEADERS order exactly
  const rows = leads.map(l => [
    today,          // Date Added
    l.businessName, // Business Name
    l.firstName,    // Owner First Name
    l.lastName,     // Owner Last Name
    l.phone,        // Phone Number
    l.city,         // City
    l.website,      // Website
    '',             // Called  (blank)
    '',             // Notes   (blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: range('A:I'),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Appended ${rows.length} new leads to "${getTabName()}"`);
  return rows.length;
}

/**
 * Smoke-test: open the spreadsheet and read its title.
 */
async function testConnection() {
  try {
    logger.info('Testing Google Sheets connection...');
    const auth   = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.get({
      spreadsheetId: getSheetId(),
      fields: 'properties.title,sheets.properties.title',
    });

    const title     = res.data.properties.title;
    const sheetTabs = res.data.sheets.map(s => s.properties.title).join(', ');
    logger.info(`Google Sheets OK — "${title}"  |  tabs: ${sheetTabs}`);
    return true;
  } catch (err) {
    logger.error('Google Sheets connection test failed', err);
    return false;
  }
}

// ── Util ──────────────────────────────────────────────────────────────────────

/** Convert a 1-based column index to a letter (1→A, 9→I, etc.) */
function colLetter(n) {
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendLeads, testConnection };
