/**
 * Google Sheets integration — reads existing leads and appends new ones.
 * Uses OAuth2 credentials stored in credentials.json + token.json.
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

// Column order that must match the spreadsheet header row
const COLUMN_ORDER = [
  'Date Added',      // A
  'Business Name',   // B
  'Owner First Name',// C
  'Owner Last Name', // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H  (left blank)
  'Notes',           // I  (left blank)
];

/**
 * Returns an authenticated Google Sheets client.
 * On first run, opens a browser prompt to authorize — saves token.json afterward.
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `credentials.json not found at ${CREDENTIALS_PATH}.\n` +
      'Copy credentials.json.example → credentials.json and fill in your OAuth2 values.'
    );
  }

  const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const { installed } = JSON.parse(raw);
  const { client_secret, client_id, redirect_uris } = installed;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // First-time authorization flow
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    console.log('\n--- Google OAuth Authorization ---');
    console.log('Open this URL in your browser to authorize access:\n');
    console.log(authUrl);
    console.log('\nAfter approving, paste the code from the browser here:');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter authorization code: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code.trim(), (err, token) => {
        if (err) return reject(new Error('Failed to get token: ' + err.message));
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('Token saved to token.json — you won\'t need to authorize again.\n');
        resolve(oAuth2Client);
      });
    });
  });
}

/**
 * Reads the Business Name column (column B) from the sheet to detect existing entries.
 *
 * @param {object} auth
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Promise<Set<string>>} lowercase set of existing business names
 */
async function getExistingBusinessNames(auth, spreadsheetId, sheetName) {
  const sheets = google.sheets({ version: 'v4', auth });

  const range = `${sheetName}!B:B`; // Business Name column
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });

  const rows = res.data.values ?? [];
  const names = new Set();

  for (const row of rows) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }

  return names;
}

/**
 * Ensures the header row exists. If the sheet is empty it writes the header first.
 */
async function ensureHeaderRow(auth, spreadsheetId, sheetName) {
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const firstRow = res.data.values?.[0] ?? [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMN_ORDER] },
    });
    console.log('  Created header row in spreadsheet.');
  }
}

/**
 * Appends new leads to the sheet, skipping any duplicates.
 *
 * @param {object} auth
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {Array} leads — normalized lead objects from apollo.js
 * @returns {Promise<{added: number, skipped: number}>}
 */
async function appendLeads(auth, spreadsheetId, sheetName, leads) {
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaderRow(auth, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(auth, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (existing.has(key)) {
      console.log(`  Skipping duplicate: ${lead.businessName}`);
      skipped++;
      continue;
    }

    // Columns: Date Added, Business Name, First, Last, Phone, City, Website, Called, Notes
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',  // Called — blank
      '',  // Notes  — blank
    ]);

    existing.add(key); // prevent dups within this batch too
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:I`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

module.exports = { getAuthClient, appendLeads };
