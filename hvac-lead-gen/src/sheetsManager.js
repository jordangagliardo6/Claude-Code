const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { config } = require('./config');
const logger = require('./logger');

let _auth = null;

/**
 * Builds and caches a Google OAuth2 client.
 * On first run, this will open a browser for authorization (handled in setup-test.js).
 * After that, the token is cached in token.json.
 */
async function getAuthClient() {
  if (_auth) return _auth;

  const credPath = path.resolve(config.google.credentialsPath);
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
        'Download it from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Download JSON'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const tokenPath = path.resolve(config.google.tokenPath);
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);

    // Refresh token automatically if expired
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        const existing = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
      }
    });
  } else {
    throw new Error(
      'Google token not found. Run `npm run test-connection` first to authorize Google Sheets access.'
    );
  }

  _auth = oAuth2Client;
  return _auth;
}

/**
 * Returns the Google Sheets API client.
 */
async function getSheetsClient() {
  const auth = await getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensures the target sheet has the correct header row.
 * Creates headers if the sheet is empty.
 */
async function ensureHeaders(sheets) {
  const range = `${config.google.sheetName}!A1:I1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length === 0) {
    logger.info('Sheet is empty — writing header row');
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [config.columns] },
    });
  } else {
    logger.info('Header row already present, skipping');
  }
}

/**
 * Reads all existing Business Names from the sheet (column B, index 1).
 * Returns a Set of lowercased names for O(1) duplicate checking.
 */
async function getExistingBusinessNames(sheets) {
  const range = `${config.google.sheetName}!B2:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  const names = new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
  logger.info(`Found ${names.size} existing business name(s) in sheet`);
  return names;
}

/**
 * Appends an array of lead objects to the Google Sheet, skipping duplicates.
 * Returns the number of rows actually written.
 */
async function appendLeads(leads) {
  const sheets = await getSheetsClient();
  await ensureHeaders(sheets);

  const existingNames = await getExistingBusinessNames(sheets);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const nameKey = lead.businessName.toLowerCase().trim();
    if (existingNames.has(nameKey)) {
      skipped.push(lead.businessName);
      continue;
    }

    // Map lead to column order: Date, Business, First, Last, Phone, City, Website, Called, Notes
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — left blank
      '', // Notes — left blank
    ]);

    // Track in-memory to avoid dupes within the same run
    existingNames.add(nameKey);
  }

  if (skipped.length > 0) {
    logger.info(`Skipped ${skipped.length} duplicate(s)`, { skipped });
  }

  if (newRows.length === 0) {
    logger.info('No new leads to write — all were duplicates or already exist');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.success(`Wrote ${newRows.length} new lead(s) to sheet`);
  return newRows.length;
}

/**
 * Verifies Google Sheets access without modifying any data.
 * Used during setup-test.js connection check.
 */
async function testConnection() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.google.spreadsheetId,
    fields: 'properties.title',
  });
  return res.data.properties.title;
}

module.exports = { appendLeads, testConnection, getAuthClient, getSheetsClient };
