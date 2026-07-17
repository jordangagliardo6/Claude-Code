'use strict';

// ─── Google OAuth2 ────────────────────────────────────────────
// Run `npm run auth` once to generate token.json.
// After that, the main workflow uses the saved token automatically.

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Scopes needed: read (to check duplicates) + write (to append rows)
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Returns an authorized OAuth2 client.
 * On first call it will prompt you to visit a URL and paste back the code.
 * On subsequent calls it loads token.json and auto-refreshes if expired.
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials.json not found in lead-gen/.\n' +
      'Download it from Google Cloud Console → APIs & Services → Credentials.\n' +
      'See SETUP in README or run `npm run setup` for details.'
    );
  }

  const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const creds = JSON.parse(raw);

  // credentials.json may come from a "Desktop app" (installed) or "Web app"
  const { client_secret, client_id, redirect_uris } =
    creds.installed || creds.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);

    // Persist refreshed tokens automatically
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...tokens }, null, 2));
      }
    });

    return oAuth2Client;
  }

  return _runInteractiveFlow(oAuth2Client);
}

async function _runInteractiveFlow(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n─────────────────────────────────────────');
  console.log('Google authorization required.');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n─────────────────────────────────────────');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Paste the authorization code here: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code.trim());
        oAuth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log('\ntoken.json saved. Google auth complete.\n');
        resolve(oAuth2Client);
      } catch (err) {
        reject(new Error('Failed to exchange auth code: ' + err.message));
      }
    });
  });
}

module.exports = { getAuthClient };
