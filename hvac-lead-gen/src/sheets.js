/**
 * Google Sheets client
 *
 * Reads existing business names to prevent duplicates,
 * then appends new lead rows to the spreadsheet.
 *
 * Column order: Date Added | Business Name | Owner First Name | Owner Last Name |
 *               Phone Number | City | Website | Called | Notes
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column positions (0-indexed) — change here if you add/reorder columns
const COLUMNS = {
  dateAdded: 0,
  businessName: 1,
  firstName: 2,
  lastName: 3,
  phone: 4,
  city: 5,
  website: 6,
  called: 7,   // left blank
  notes: 8,    // left blank
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

/**
 * Build and return an authenticated Sheets API client.
 * On first run this will open a browser URL for OAuth consent.
 */
async function getAuthClient(credentialsPath, tokenPath) {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Use cached token if available
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // First-time OAuth flow
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n=== FIRST-TIME SETUP REQUIRED ===');
  console.log('Open this URL in your browser and authorize the app:');
  console.log('\n', authUrl, '\n');

  const code = await promptUser('Paste the authorization code here: ');
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log('Token saved to', tokenPath);

  return oAuth2Client;
}

function promptUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

/**
 * Ensure the header row exists on the sheet (adds it if the sheet is empty).
 */
async function ensureHeader(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });
  const row = (res.data.values || [])[0] || [];
  if (row.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    console.log('Header row written to sheet.');
  }
}

/**
 * Fetch the set of business names already in the spreadsheet (case-insensitive).
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`, // Business Name column
  });
  const values = res.data.values || [];
  return new Set(
    values.flat().map((v) => (v || '').trim().toLowerCase()).filter(Boolean)
  );
}

/**
 * Append an array of lead objects to the spreadsheet.
 * Skips any lead whose business name already exists.
 * Returns the count of rows actually appended.
 */
async function appendLeads(credentialsPath, tokenPath, spreadsheetId, sheetName, leads) {
  const auth = await getAuthClient(credentialsPath, tokenPath);
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeader(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const newRows = leads
    .filter((lead) => !existing.has((lead.businessName || '').trim().toLowerCase()))
    .map((lead) => {
      const row = new Array(9).fill('');
      row[COLUMNS.dateAdded] = today;
      row[COLUMNS.businessName] = lead.businessName;
      row[COLUMNS.firstName] = lead.firstName;
      row[COLUMNS.lastName] = lead.lastName;
      row[COLUMNS.phone] = lead.phone;
      row[COLUMNS.city] = lead.city;
      row[COLUMNS.website] = lead.website;
      // called and notes intentionally left blank
      return row;
    });

  if (newRows.length === 0) {
    console.log('No new leads to append (all already exist in sheet).');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`Appended ${newRows.length} new lead(s) to sheet.`);
  return newRows.length;
}

module.exports = { appendLeads };
