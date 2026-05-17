/**
 * Google Sheets writer module
 *
 * Reads existing rows to check for duplicates, then appends new leads.
 * Uses OAuth 2.0 — on first run, opens a browser auth URL and saves a token.
 *
 * Required Google API scopes:
 *   https://www.googleapis.com/auth/spreadsheets
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');
const config = require('./config');
const log = require('./logger');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function loadCredentials() {
  const credPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-credentials.json');
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      `Download it from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.`
    );
  }
  return JSON.parse(fs.readFileSync(credPath, 'utf8'));
}

/**
 * Returns an authenticated OAuth2 client.
 * On the first run (no token file) it prints an auth URL and waits for the
 * user to paste the authorization code back into the terminal.
 */
async function getAuthClient() {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const tokenPath = path.resolve(process.env.GOOGLE_TOKEN_PATH || './credentials/google-token.json');

  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oauth2Client.setCredentials(token);

    // Refresh the access token if it has expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      log.info('Google token expired — refreshing...');
      const { credentials: newCreds } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(newCreds);
      fs.writeFileSync(tokenPath, JSON.stringify(newCreds));
      log.info('Token refreshed and saved.');
    }

    return oauth2Client;
  }

  // First-time authorization flow
  const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n──────────────────────────────────────────────────────');
  console.log('GOOGLE AUTHORIZATION REQUIRED');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nThen paste the authorization code below:');
  console.log('──────────────────────────────────────────────────────\n');

  const code = await promptUser('Enter the code: ');
  const { tokens } = await oauth2Client.getToken(code.trim());
  oauth2Client.setCredentials(tokens);
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(tokens));
  log.info(`Google token saved to ${tokenPath}`);

  return oauth2Client;
}

function promptUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────

/**
 * Ensures the header row exists. If the sheet is brand new (empty), writes
 * the column headers from config.SHEET_COLUMNS.
 */
async function ensureHeaders(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!1:1',
  });

  const existing = res.data.values?.[0] || [];
  if (existing.length === 0) {
    log.info('Sheet is empty — writing header row');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [config.SHEET_COLUMNS] },
    });
  }
}

/**
 * Reads all existing Business Name values from the sheet and returns them
 * as a lowercase Set for O(1) dedup lookups.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const colLetter = columnIndexToLetter(config.DEDUP_COLUMN_INDEX);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Skip row 1 (headers), read the business name column
    range: `Sheet1!${colLetter}2:${colLetter}10000`,
  });

  const names = new Set();
  for (const row of res.data.values || []) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }
  return names;
}

/**
 * Appends an array of lead objects to the sheet.
 * Returns the number of rows actually written (after dedup filtering).
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) {
    log.info('No leads to append.');
    return 0;
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not set in environment variables.');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets, spreadsheetId);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId);
  log.info(`Sheet has ${existing.size} existing business names (for dedup check)`);

  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const rows = [];
  const skipped = [];

  for (const lead of leads) {
    const name = (lead.businessName || '').toLowerCase().trim();

    if (!name) {
      log.warn('Skipping lead with no business name');
      continue;
    }

    if (existing.has(name)) {
      skipped.push(lead.businessName);
      continue;
    }

    // Mark as seen so we don't add the same business twice within this batch
    existing.add(name);

    // Build a row that matches SHEET_COLUMNS order exactly
    rows.push([
      today,               // Date Added
      lead.businessName,   // Business Name
      lead.firstName,      // Owner First Name
      lead.lastName,       // Owner Last Name
      lead.phone,          // Phone Number
      lead.city,           // City
      lead.website,        // Website
      '',                  // Called (blank)
      '',                  // Notes (blank)
    ]);
  }

  if (skipped.length > 0) {
    log.info(`Skipped ${skipped.length} duplicate(s): ${skipped.join(', ')}`);
  }

  if (rows.length === 0) {
    log.info('All leads were duplicates — nothing written to sheet.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:I',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  log.info(`Wrote ${rows.length} new lead(s) to Google Sheet.`);
  return rows.length;
}

/**
 * Verifies the sheet is reachable and returns basic metadata.
 */
async function verifyConnection() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not set.');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return {
    title: meta.data.properties.title,
    sheets: meta.data.sheets.map((s) => s.properties.title),
  };
}

function columnIndexToLetter(index) {
  // 0 → A, 1 → B, etc. (handles single letter only, fine for ≤26 columns)
  return String.fromCharCode(65 + index);
}

module.exports = { appendLeads, verifyConnection, getAuthClient };
