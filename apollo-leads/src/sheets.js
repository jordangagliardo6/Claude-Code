/**
 * Google Sheets integration via googleapis (OAuth2).
 *
 * First run: calls authorize() which prompts you to visit a URL and paste a code.
 * That exchanges for a token saved in token.json — subsequent runs are silent.
 *
 * Required env vars: GOOGLE_SHEET_ID, SHEET_NAME (optional, defaults to Sheet1)
 * Required file:     credentials.json (OAuth2 desktop client from Google Cloud Console)
 */

const { google }  = require('googleapis');
const path        = require('path');
const fs          = require('fs');
const readline    = require('readline');
const config      = require('./config');
const logger      = require('./logger');

const SCOPES          = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH      = path.join(__dirname, '..', 'token.json');
const CREDENTIALS_PATH= path.join(__dirname, '..', 'credentials.json');

// ── Auth ─────────────────────────────────────────────────────────────────────

async function authorize() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `credentials.json not found at ${CREDENTIALS_PATH}. ` +
      'Download it from Google Cloud Console → APIs & Services → Credentials.'
    );
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const creds = raw.installed ?? raw.web;
  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0],
  );

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    // Refresh the token automatically if it's expired
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...oAuth2Client.credentials, ...tokens }));
      }
    });
    return oAuth2Client;
  }

  return promptForToken(oAuth2Client);
}

async function promptForToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Google OAuth — one-time setup required     ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log('1. Open this URL in your browser:\n');
  console.log('   ' + authUrl + '\n');
  console.log('2. Sign in and grant access to Google Sheets.');
  console.log('3. Copy the authorization code shown and paste it below.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question('Paste authorization code: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code.trim(), (err, token) => {
        if (err) return reject(new Error('Failed to get token: ' + err.message));
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('\nToken saved to token.json — you will not be prompted again.\n');
        resolve(oAuth2Client);
      });
    });
  });
}

// ── Sheet operations ──────────────────────────────────────────────────────────

// Returns a Set of lowercase business names already in column B (skips header row)
async function getExistingBusinessNames(sheets) {
  const { spreadsheetId, sheetName } = config;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B:B`,
  });

  const rows = res.data.values ?? [];
  return new Set(rows.slice(1).map(r => (r[0] ?? '').trim().toLowerCase()));
}

async function ensureHeaderRow(sheets) {
  const { spreadsheetId, sheetName } = config;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
          'Phone Number', 'City', 'Website', 'Called', 'Notes',
        ]],
      },
    });
    logger.info('Header row created in sheet');
  }
}

async function appendLeads(leads) {
  if (!leads.length) {
    logger.info('No leads to append');
    return 0;
  }

  const auth   = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  const { spreadsheetId, sheetName } = config;

  await ensureHeaderRow(sheets);

  const existingNames = await getExistingBusinessNames(sheets);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit', day: '2-digit', year: 'numeric',
  });

  const newRows  = [];
  const skipped  = [];

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase();

    if (!key || existingNames.has(key)) {
      skipped.push(lead.businessName || '(unnamed)');
      continue;
    }

    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phoneNumber,
      lead.city,
      lead.website,
      '',  // Called — filled manually
      '',  // Notes  — filled manually
    ]);

    existingNames.add(key); // prevent intra-batch duplicates
  }

  if (skipped.length) {
    logger.info(`Skipped ${skipped.length} duplicate(s): ${skipped.join(', ')}`);
  }

  if (!newRows.length) {
    logger.info('All leads were duplicates — nothing new added');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.info(`Appended ${newRows.length} new lead(s) to "${sheetName}"`);
  return newRows.length;
}

module.exports = { appendLeads, authorize };
