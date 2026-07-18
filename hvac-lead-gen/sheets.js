/**
 * Google Sheets wrapper for reading existing leads and appending new ones.
 *
 * Uses the googleapis npm package with OAuth2.
 * On first run, follow the auth URL printed to console — after that the token
 * is cached in token.json so subsequent runs are fully automatic.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

// Column layout — update these if you rename or reorder columns in your sheet
const COLUMNS = {
  DATE_ADDED:     'A',
  BUSINESS_NAME:  'B',
  FIRST_NAME:     'C',
  LAST_NAME:      'D',
  PHONE:          'E',
  CITY:           'F',
  WEBSITE:        'G',
  CALLED:         'H', // left blank
  NOTES:          'I', // left blank
};

// 0-based index of the Business Name column for duplicate checking
const BUSINESS_NAME_COL_INDEX = 1; // Column B = index 1

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

/**
 * Load (or create) an authenticated Google OAuth2 client.
 * On first run this will print a URL; paste the code back in the terminal.
 */
async function getAuthClient() {
  const credPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json');
  const tokenPath = path.resolve(process.env.GOOGLE_TOKEN_PATH || './token.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at ${credPath}.\n` +
      'Download it from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client → Download JSON.\n' +
      `Save it as ${credPath} and re-run.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);

    // Auto-refresh if expired
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        const current = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        current.refresh_token = tokens.refresh_token;
        fs.writeFileSync(tokenPath, JSON.stringify(current));
      }
    });

    return oAuth2Client;
  }

  // First-time auth flow
  return await runFirstTimeAuth(oAuth2Client, tokenPath);
}

async function runFirstTimeAuth(oAuth2Client, tokenPath) {
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\n=== FIRST-TIME GOOGLE AUTH REQUIRED ===');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter approving, paste the code from the browser below:');

  const code = await promptLine('Authorization code: ');
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens));
  console.log(`Token saved to ${tokenPath}. Future runs will not require this step.\n`);
  return oAuth2Client;
}

function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

/**
 * Read all existing business names from the sheet (column B) to check for duplicates.
 * Returns a Set of lowercased business names.
 */
async function getExistingBusinessNames(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  const range = `${tab}!${COLUMNS.BUSINESS_NAME}2:${COLUMNS.BUSINESS_NAME}`;

  let res;
  try {
    res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  } catch (err) {
    throw new Error(`Failed to read Google Sheet: ${err.message}`);
  }

  const rows = res.data.values || [];
  const names = new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
  console.log(`Sheet currently has ${names.size} existing businesses.`);
  return names;
}

/**
 * Append new leads to the sheet, skipping any that already exist.
 * Returns the count of rows actually written.
 */
async function appendLeads(auth, leads, existingNames) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  for (const lead of leads) {
    const nameKey = (lead.businessName || '').toLowerCase().trim();
    if (!nameKey || existingNames.has(nameKey)) {
      console.log(`  Skipping duplicate: ${lead.businessName}`);
      continue;
    }

    // Row order must match COLUMNS definition above
    newRows.push([
      today,              // A: Date Added
      lead.businessName,  // B: Business Name
      lead.firstName,     // C: Owner First Name
      lead.lastName,      // D: Owner Last Name
      lead.phone,         // E: Phone Number
      lead.city,          // F: City
      lead.website,       // G: Website
      '',                 // H: Called (blank)
      '',                 // I: Notes (blank)
    ]);

    existingNames.add(nameKey); // Prevent intra-batch duplicates
  }

  if (!newRows.length) {
    console.log('No new leads to append after duplicate check.');
    return 0;
  }

  const range = `${tab}!A:I`;
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  } catch (err) {
    throw new Error(`Failed to write to Google Sheet: ${err.message}`);
  }

  console.log(`Appended ${newRows.length} new leads to "${tab}" tab.`);
  return newRows.length;
}

/**
 * Ensure the header row exists. Safe to call on every run — it skips if row 1 already has data.
 */
async function ensureHeaderRow(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:I1`,
  });

  const firstRow = res.data.values?.[0] || [];
  if (firstRow.length > 0) return; // Headers already exist

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'Date Added',
        'Business Name',
        'Owner First Name',
        'Owner Last Name',
        'Phone Number',
        'City',
        'Website',
        'Called',
        'Notes',
      ]],
    },
  });
  console.log('Header row created in sheet.');
}

module.exports = { getAuthClient, getExistingBusinessNames, appendLeads, ensureHeaderRow };
