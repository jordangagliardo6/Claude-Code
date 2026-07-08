/**
 * sheets.js — Google Sheets integration via OAuth2
 *
 * Auth flow (first run only):
 *   1. setup.js prints an authorization URL.
 *   2. You open it, grant access, copy the code.
 *   3. setup.js saves credentials/token.json.
 *   4. All subsequent runs load the token silently.
 *
 * To use a Service Account instead (no browser flow), swap getAuthClient()
 * for a google.auth.GoogleAuth({ keyFile, scopes }) call and share the
 * spreadsheet with the service account email.
 */

'use strict';

const fs        = require('fs');
const path      = require('path');
const readline  = require('readline');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'credentials.json');
const TOKEN_PATH       = path.join(__dirname, '..', 'credentials', 'token.json');

// Sheets API read + write, nothing else.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column layout — change here if you add/reorder columns.
const COLUMNS = {
  DATE_ADDED:       'A',
  BUSINESS_NAME:    'B',
  OWNER_FIRST_NAME: 'C',
  OWNER_LAST_NAME:  'D',
  PHONE_NUMBER:     'E',
  CITY:             'F',
  WEBSITE:          'G',
  CALLED:           'H',  // left blank — you fill this in manually
  NOTES:            'I',  // left blank
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Returns an authenticated OAuth2 client.
 * Loads token.json if it exists; otherwise starts the interactive auth flow.
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Missing credentials.json — download it from Google Cloud Console and ` +
      `place it at: ${CREDENTIALS_PATH}\n` +
      `See setup.js step 3 for full instructions.`
    );
  }

  const raw         = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const creds       = JSON.parse(raw);
  const { client_id, client_secret, redirect_uris } =
    creds.installed || creds.web;

  const oAuth2 = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2.setCredentials(token);

    // Refresh the access token if it has expired or will expire in < 5 minutes.
    const expiresAt = token.expiry_date || 0;
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      try {
        const { credentials } = await oAuth2.refreshAccessToken();
        oAuth2.setCredentials(credentials);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials));
      } catch {
        // Refresh failed (token revoked, etc.) — prompt for new auth.
        return authorizeNewToken(oAuth2);
      }
    }

    return oAuth2;
  }

  return authorizeNewToken(oAuth2);
}

/**
 * Interactive OAuth flow: print the URL, read the code from stdin, save token.
 * Only runs once (or when token.json is deleted/revoked).
 */
async function authorizeNewToken(oAuth2) {
  const authUrl = oAuth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // ensures we always get a refresh_token
  });

  console.log('\n─────────────────────────────────────────');
  console.log('Google OAuth authorization required.');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n─────────────────────────────────────────');

  const rl   = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve =>
    rl.question('\nPaste the authorization code here: ', c => { rl.close(); resolve(c.trim()); })
  );

  const { tokens } = await oAuth2.getToken(code);
  oAuth2.setCredentials(tokens);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('✓ Token saved to', TOKEN_PATH);

  return oAuth2;
}

// ─── Sheet operations ─────────────────────────────────────────────────────────

/**
 * Reads the Business Name column (B) and returns a Set of existing names.
 * Used for duplicate detection — comparison is case-insensitive + trimmed.
 */
async function getExistingBusinessNames(auth) {
  const sheets   = google.sheets({ version: 'v4', auth });
  const sheetId  = process.env.GOOGLE_SHEET_ID;
  const tabName  = process.env.SHEET_TAB_NAME || 'Sheet1';
  const range    = `${tabName}!${COLUMNS.BUSINESS_NAME}:${COLUMNS.BUSINESS_NAME}`;

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  const rows = (data.values || []).flat();
  return new Set(
    rows
      .filter(name => name && name !== 'Business Name') // skip header
      .map(name => name.trim().toLowerCase())
  );
}

/**
 * Appends an array of lead objects to the sheet.
 * Each lead: { businessName, firstName, lastName, phone, city, website }
 *
 * @returns {number} Number of rows written.
 */
async function appendLeads(auth, leads) {
  if (!leads.length) return 0;

  const sheets  = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tabName = process.env.SHEET_TAB_NAME || 'Sheet1';
  const range   = `${tabName}!${COLUMNS.DATE_ADDED}:${COLUMNS.NOTES}`;

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
  });

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website || '',
    '', // Called — blank
    '', // Notes — blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Checks that the spreadsheet exists and the header row matches expectations.
 * Called by setup.js and at the top of each run for a quick sanity check.
 *
 * @returns {{ ok: boolean, message: string }}
 */
async function verifySheet(auth) {
  const sheets  = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tabName = process.env.SHEET_TAB_NAME || 'Sheet1';

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:I1`,
  });

  const headers = (data.values?.[0] || []).map(h => h.trim());
  const expected = [
    'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
    'Phone Number', 'City', 'Website', 'Called', 'Notes',
  ];

  if (!headers.length) {
    // Sheet is empty — write the headers now.
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [expected] },
    });
    return { ok: true, message: 'Headers created in empty sheet.' };
  }

  const mismatches = expected.filter((h, i) => headers[i] !== h);
  if (mismatches.length) {
    return {
      ok: false,
      message:
        `Header mismatch in columns: ${mismatches.join(', ')}.\n` +
        `Expected row 1 to be: ${expected.join(' | ')}\n` +
        `Found:                 ${headers.join(' | ')}`,
    };
  }

  return { ok: true, message: `Sheet verified — ${headers.length} columns look correct.` };
}

module.exports = {
  getAuthClient,
  getExistingBusinessNames,
  appendLeads,
  verifySheet,
  COLUMNS,
};
