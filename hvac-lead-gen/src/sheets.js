const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const config = require('./config');
const logger = require('./logger');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Returns an authenticated Google Sheets client.
// On first run, opens a browser for OAuth consent and saves the token.
async function getAuthClient() {
  const credentialsPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'
  );
  const tokenPath = path.resolve(
    process.env.GOOGLE_TOKEN_PATH || './token.json'
  );

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials file not found at ${credentialsPath}. ` +
      'Download it from Google Cloud Console → APIs & Services → Credentials.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);

    // Auto-refresh if token is about to expire
    oAuth2Client.on('tokens', (newTokens) => {
      const merged = { ...token, ...newTokens };
      fs.writeFileSync(tokenPath, JSON.stringify(merged));
      logger.info('Google OAuth token refreshed and saved.');
    });

    return oAuth2Client;
  }

  // First-time auth: generate URL and prompt user to paste the code
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n========================================');
  console.log('GOOGLE SHEETS AUTHORIZATION REQUIRED');
  console.log('========================================');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter approving, you will be redirected to a URL.');
  console.log('Copy the "code" parameter from that URL and paste it below.\n');

  const code = await promptForCode();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens));
  logger.info(`Google OAuth token saved to ${tokenPath}`);

  return oAuth2Client;
}

// Reads a line from stdin — used only during first-time OAuth setup.
function promptForCode() {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question('Paste the authorization code here: ', (code) => {
      readline.close();
      resolve(code.trim());
    });
  });
}

// Fetches all values from the "Business Name" column so we can detect duplicates.
async function getExistingBusinessNames(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  // Column B is "Business Name" in our column layout: Date Added | Business Name | ...
  const range = `'${sheetName}'!B:B`;

  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];

  // rows[0] is the header ("Business Name"), skip it; collect all business names in lowercase
  return new Set(
    rows
      .slice(1)
      .map((row) => (row[0] || '').toLowerCase().trim())
      .filter(Boolean)
  );
}

// Appends a batch of new lead rows to the sheet.
// Returns the number of rows actually written.
async function appendLeads(auth, leads) {
  if (leads.length === 0) {
    logger.info('No new leads to append.');
    return 0;
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Build rows in the exact column order defined in config.sheetColumns:
  // Date Added | Business Name | Owner First Name | Owner Last Name |
  // Phone Number | City | Website | Called | Notes
  const rows = leads.map((lead) => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank for manual entry
    '', // Notes  — left blank for manual entry
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Appended ${rows.length} new lead(s) to the spreadsheet.`);
  return rows.length;
}

// Ensures the sheet has the correct header row.
// Safe to call every run — skips if headers already exist.
async function ensureHeaders(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A1:I1`,
  });

  const firstRow = response.data.values?.[0] || [];
  if (firstRow.length > 0) return; // Headers already exist

  logger.info('Sheet appears empty — writing header row...');
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [config.sheetColumns] },
  });
  logger.info('Header row written.');
}

module.exports = { getAuthClient, getExistingBusinessNames, appendLeads, ensureHeaders };
