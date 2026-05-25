const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('./config');

/**
 * Authenticate with Google Sheets API.
 * On first run, opens a browser OAuth flow and saves token.json.
 * Subsequent runs reuse the saved token automatically.
 */
async function getAuthClient() {
  const credentialsPath = path.resolve(config.google.credentialsPath);
  const tokenPath = path.resolve(config.google.tokenPath);

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials file not found at: ${credentialsPath}\n` +
      'Please download credentials.json from Google Cloud Console and place it in the project root.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // If a saved token exists, use it (handles automatic token refresh)
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);

    // Save refreshed token if it gets updated
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        const current = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        fs.writeFileSync(tokenPath, JSON.stringify({ ...current, ...tokens }));
      }
    });

    return oAuth2Client;
  }

  // First-time OAuth flow — prompts user in the terminal
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: config.google.scopes,
  });

  console.log('\n[Google Auth] First-time setup: Authorize this app by visiting this URL:\n');
  console.log(authUrl);
  console.log('\nAfter authorizing, you will be redirected to a URL. Copy the "code" parameter from that URL.\n');

  const code = await promptForCode();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.writeFileSync(tokenPath, JSON.stringify(tokens));
  console.log('[Google Auth] Token saved to', tokenPath);

  return oAuth2Client;
}

/**
 * Interactive prompt to paste the OAuth authorization code.
 */
function promptForCode() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter the authorization code: ', (code) => {
      rl.close();
      resolve(code.trim());
    });
  });
}

/**
 * Ensure the spreadsheet has a "Leads" sheet with the correct header row.
 * Creates the header if the sheet is empty.
 */
async function ensureSheetReady(sheets) {
  const spreadsheetId = config.google.spreadsheetId;
  const sheetName = config.google.sheetName;

  // Check if the sheet tab exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetsList = meta.data.sheets || [];
  const sheetExists = sheetsList.some(s => s.properties.title === sheetName);

  if (!sheetExists) {
    // Create the sheet tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    console.log(`[Sheets] Created new sheet tab: "${sheetName}"`);
  }

  // Check if the header row exists
  const range = `${sheetName}!A1:${columnLetter(config.SHEET_COLUMNS.length)}1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existing = res.data.values?.[0] || [];

  if (existing.length === 0) {
    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.SHEET_COLUMNS] },
    });
    console.log('[Sheets] Header row written.');
  }
}

/**
 * Fetch all existing business names from the sheet for duplicate detection.
 * Returns a Set of lowercase business names.
 */
async function getExistingBusinessNames(sheets) {
  const spreadsheetId = config.google.spreadsheetId;
  const sheetName = config.google.sheetName;
  const colLetter = columnLetter(config.BUSINESS_NAME_COL_INDEX + 1); // 1-indexed

  // Read from row 2 downward (skip header)
  const range = `${sheetName}!${colLetter}2:${colLetter}10000`;

  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = res.data.values || [];
    return new Set(values.map(row => (row[0] || '').toLowerCase().trim()));
  } catch {
    return new Set();
  }
}

/**
 * Append new lead rows to the spreadsheet, skipping duplicates.
 * Returns the count of rows actually appended.
 */
async function appendLeads(leads) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureSheetReady(sheets);

  const existingNames = await getExistingBusinessNames(sheets);
  console.log(`[Sheets] ${existingNames.size} existing business names loaded for duplicate check.`);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: config.scheduler.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const nameKey = lead.businessName.toLowerCase().trim();

    if (!nameKey) {
      skipped.push('(unnamed business)');
      continue;
    }

    if (existingNames.has(nameKey)) {
      skipped.push(lead.businessName);
      continue;
    }

    // Build row in the exact column order defined in config.SHEET_COLUMNS:
    // Date Added, Business Name, Owner First Name, Owner Last Name,
    // Phone Number, City, Website, Called (blank), Notes (blank)
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — left blank for manual fill-in
      '', // Notes — left blank for manual fill-in
    ]);

    // Track in-memory so we don't add dupes within the same batch
    existingNames.add(nameKey);
  }

  if (skipped.length > 0) {
    console.log(`[Sheets] Skipped ${skipped.length} duplicate(s): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`);
  }

  if (newRows.length === 0) {
    console.log('[Sheets] No new leads to append — all were duplicates or missing names.');
    return 0;
  }

  const spreadsheetId = config.google.spreadsheetId;
  const range = `${config.google.sheetName}!A:A`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[Sheets] Appended ${newRows.length} new lead(s).`);
  return newRows.length;
}

/**
 * Quick connectivity test — verifies credentials work and the spreadsheet is accessible.
 */
async function testConnection() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.google.spreadsheetId,
  });

  return {
    title: meta.data.properties.title,
    sheetCount: meta.data.sheets.length,
  };
}

/**
 * Convert a 1-based column number to a spreadsheet letter (1→A, 26→Z, 27→AA).
 */
function columnLetter(n) {
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = { appendLeads, testConnection, getAuthClient };
