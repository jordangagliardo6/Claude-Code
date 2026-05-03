/**
 * Google Sheets integration
 * Reads existing leads, deduplicates, and appends new rows
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Column order for the sheet — adjust here if you ever add/remove columns
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H (left blank — for manual use)
  'Notes',            // I (left blank — for manual use)
];

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Builds an authorized Google Sheets client.
 * On first run it will open a browser URL and prompt for the auth code.
 * After that the token is cached in GOOGLE_TOKEN_PATH.
 */
async function getAuthClient() {
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || './token.json';

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials file not found at: ${credentialsPath}\n` +
        'See credentials.example.json and the README for setup instructions.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_id, client_secret, redirect_uris } =
    credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Use cached token if available
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // First-time OAuth flow
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n[Google Auth] Authorize this app by visiting:\n');
  console.log(`  ${authUrl}\n`);

  const code = await promptUser('Paste the authorization code here: ');
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`[Google Auth] Token saved to ${tokenPath}`);

  return oAuth2Client;
}

function promptUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Ensures the header row exists. Creates it if the sheet is empty.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:${columnLetter(COLUMNS.length)}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = res.data.values?.[0] || [];

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('[Sheets] Header row created.');
  }
}

/**
 * Reads all existing Business Name values from column B to build a dedup set.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!B2:B`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  // Normalize to lowercase for case-insensitive comparison
  return new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
}

/**
 * Appends an array of lead objects to the sheet.
 * Skips leads whose Business Name already exists.
 * Returns { added, skipped } counts.
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) return { added: 0, skipped: 0 };

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');

  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    // Mark as seen so we don't add duplicates within the same batch
    existing.add(key);

    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — blank
      '', // Notes — blank
    ]);
  }

  if (newRows.length === 0) {
    return { added: 0, skipped };
  }

  const appendRange = `${sheetName}!A:I`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: appendRange,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return { added: newRows.length, skipped };
}

/**
 * Quick connectivity check — reads the spreadsheet metadata.
 */
async function testConnection() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties?.title || '(unknown)';
}

/** Converts a 1-based column index to a letter (1=A, 2=B, …, 26=Z) */
function columnLetter(n) {
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = { appendLeads, testConnection, COLUMNS };
