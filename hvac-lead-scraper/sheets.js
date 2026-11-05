/**
 * sheets.js – Google Sheets integration.
 *
 * Authentication priority:
 *   1. Service account (GOOGLE_SERVICE_ACCOUNT_PATH) – recommended for automation
 *   2. OAuth2 (credentials.json + token.json) – run `node setup.js` once first
 *
 * Share the spreadsheet with the service account email (Editor access) if using
 * the service account path, or run `node setup.js` to authorize via OAuth2.
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const config = require('./config');

const { sheets: cfg } = config;

// ── Authentication ────────────────────────────────────────────────────────────

async function getAuthClient() {
  const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json';
  const saAbsolute = path.resolve(saPath);

  if (fs.existsSync(saAbsolute)) {
    // Service account auth
    const serviceAccount = JSON.parse(fs.readFileSync(saAbsolute, 'utf8'));
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth.getClient();
  }

  // OAuth2 fallback – requires running setup.js first
  const credPath = path.resolve(process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './credentials.json');
  const tokenPath = path.resolve('./token.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      'Google credentials not found. ' +
      'Either place service-account.json here or run `node setup.js` for OAuth2.'
    );
  }

  const { client_secret, client_id, redirect_uris } = JSON.parse(
    fs.readFileSync(credPath, 'utf8')
  ).installed || JSON.parse(fs.readFileSync(credPath, 'utf8')).web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      'OAuth2 token not found. Run `node setup.js` to authorize Google access.'
    );
  }

  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));
  return oAuth2Client;
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

/**
 * Ensures the first row of the sheet contains the correct headers.
 * Does nothing if headers are already present; writes them if the sheet is empty.
 */
async function ensureHeaders(sheetsApi) {
  const range = `${cfg.sheetName}!A1:I1`;
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: cfg.spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length === 0 || rows[0].length === 0) {
    console.log('[Sheets] Writing header row...');
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: cfg.spreadsheetId,
      range: `${cfg.sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [cfg.headers] },
    });
  }
}

/**
 * Reads all existing business names from column B (index 1) and returns a Set.
 * Used to skip duplicate entries before appending.
 */
async function getExistingBusinessNames(sheetsApi) {
  const range = `${cfg.sheetName}!B:B`; // Business Name column
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: cfg.spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  // Skip header row (row 0 = "Business Name")
  const names = rows.slice(1).map((r) => (r[0] || '').trim().toLowerCase());
  return new Set(names);
}

/**
 * Appends an array of lead objects to the spreadsheet, skipping duplicates.
 * Returns { added, skipped } counts.
 */
async function appendLeads(leads) {
  if (!cfg.spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set. Add it to your .env file.');
  }

  const authClient = await getAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth: authClient });

  await ensureHeaders(sheetsApi);

  const existing = await getExistingBusinessNames(sheetsApi);
  console.log(`[Sheets] ${existing.size} existing businesses on file`);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const rows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (existing.has(key)) {
      console.log(`[Sheets] Skipping duplicate: ${lead.businessName}`);
      skipped++;
      continue;
    }

    // Build the row in the same column order as cfg.headers:
    // Date Added | Business Name | First Name | Last Name | Phone | City | Website | Called | Notes
    rows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',  // Called – blank for user to fill
      '',  // Notes  – blank for user to fill
    ]);

    existing.add(key); // prevent dupes within the same batch
  }

  if (rows.length === 0) {
    console.log('[Sheets] No new leads to add.');
    return { added: 0, skipped };
  }

  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: cfg.spreadsheetId,
    range: `${cfg.sheetName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new lead(s).`);
  return { added: rows.length, skipped };
}

/**
 * Quick connectivity test – reads sheet metadata without writing anything.
 * Returns the spreadsheet title on success; throws on failure.
 */
async function testConnection() {
  const authClient = await getAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth: authClient });

  const meta = await sheetsApi.spreadsheets.get({
    spreadsheetId: cfg.spreadsheetId,
    fields: 'properties.title',
  });

  return meta.data.properties.title;
}

module.exports = { appendLeads, testConnection, ensureHeaders };
