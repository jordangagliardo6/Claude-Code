/**
 * sheets.js — Google Sheets integration
 *
 * Reads existing leads and appends new ones to the configured spreadsheet.
 * Uses OAuth2 credentials stored in the credentials/ directory.
 *
 * Column order (matches the sheet exactly):
 *   A: Date Added
 *   B: Business Name
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called        (left blank — you fill this in)
 *   I: Notes         (left blank — you fill this in)
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');

// Column index constants (0-based, matching the sheet layout above)
const COL = {
  DATE_ADDED: 0,
  BUSINESS_NAME: 1,
  FIRST_NAME: 2,
  LAST_NAME: 3,
  PHONE: 4,
  CITY: 5,
  WEBSITE: 6,
  CALLED: 7,
  NOTES: 8,
};

// Google Sheets API scopes needed
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Loads or creates OAuth2 credentials, prompting for auth if needed.
 *
 * @param {string} credentialsPath - Path to google-credentials.json
 * @param {string} tokenPath       - Path to cached token.json
 * @returns {Promise<OAuth2Client>}
 */
async function getAuthClient(credentialsPath, tokenPath) {
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials file not found at: ${credentialsPath}\n` +
        'Download it from Google Cloud Console → APIs & Services → Credentials.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed ?? credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Use cached token if it exists
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);
    // Refresh if expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      const { credentials: refreshed } = await oAuth2Client.refreshAccessToken();
      oAuth2Client.setCredentials(refreshed);
      fs.writeFileSync(tokenPath, JSON.stringify(refreshed));
      console.log('[Sheets] OAuth token refreshed and cached.');
    }
    return oAuth2Client;
  }

  // First-time authorization — interactive prompt
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n[Sheets] No cached token found. Authorize this app by visiting:\n');
  console.log(authUrl);
  console.log('\nPaste the authorization code here:');

  const code = await promptUser('Code: ');
  const { tokens } = await oAuth2Client.getToken(code.trim());
  oAuth2Client.setCredentials(tokens);

  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(tokens));
  console.log(`[Sheets] Token cached at ${tokenPath}`);

  return oAuth2Client;
}

/**
 * Simple stdin prompt helper used only during first-run OAuth flow.
 */
function promptUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

/**
 * Reads all existing Business Names from the sheet to detect duplicates.
 *
 * @param {OAuth2Client} auth
 * @param {string} sheetId  - Google Sheet ID
 * @param {string} tabName  - Tab/sheet name (e.g. "Leads")
 * @returns {Promise<Set<string>>} Lowercase business names already in the sheet
 */
async function getExistingBusinessNames(auth, sheetId, tabName) {
  const sheets = google.sheets({ version: 'v4', auth });

  let rows;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      // Column B = Business Name; skip header row 1
      range: `${tabName}!B2:B`,
    });
    rows = res.data.values ?? [];
  } catch (err) {
    throw new Error(`Failed to read sheet: ${err.message}`);
  }

  const names = new Set(rows.flat().map((n) => n.toLowerCase().trim()));
  console.log(`[Sheets] Found ${names.size} existing businesses in sheet.`);
  return names;
}

/**
 * Ensures the sheet has the correct header row. Creates it if the sheet is empty.
 *
 * @param {OAuth2Client} auth
 * @param {string} sheetId
 * @param {string} tabName
 */
async function ensureHeaders(auth, sheetId, tabName) {
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:I1`,
  });

  const existingHeader = res.data.values?.[0] ?? [];
  if (existingHeader.length > 0) return; // Headers already present

  const headers = [
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

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:I1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });

  console.log('[Sheets] Header row created.');
}

/**
 * Appends new leads to the spreadsheet, skipping duplicates.
 *
 * @param {OAuth2Client} auth
 * @param {string} sheetId
 * @param {string} tabName
 * @param {Array} leads - Normalized lead objects from apollo.js
 * @returns {Promise<{added: number, skipped: number}>}
 */
async function appendLeads(auth, sheetId, tabName, leads) {
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(auth, sheetId, tabName);
  const existing = await getExistingBusinessNames(auth, sheetId, tabName);

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
      console.log(`[Sheets] Skipping duplicate: ${lead.businessName}`);
      skipped++;
      continue;
    }
    existing.add(key); // prevent intra-batch duplicates too

    newRows.push([
      today,           // A: Date Added
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',              // H: Called — blank for you to fill
      '',              // I: Notes  — blank for you to fill
    ]);
  }

  if (newRows.length === 0) {
    console.log('[Sheets] No new leads to append.');
    return { added: 0, skipped };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tabName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[Sheets] Appended ${newRows.length} new leads.`);
  return { added: newRows.length, skipped };
}

module.exports = { getAuthClient, appendLeads };
