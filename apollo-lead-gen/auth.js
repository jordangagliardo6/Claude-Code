/**
 * One-time Google OAuth2 authorization helper.
 *
 * Run this ONCE before the first scheduled execution:
 *   node auth.js
 *
 * It will open a browser, ask you to sign in with Google, and save a
 * token.json file to credentials/.  The scheduler uses that token on
 * every subsequent run without prompting you again.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project → APIs & Services → Enable "Google Sheets API"
 *   3. Credentials → Create → OAuth 2.0 Client ID → Desktop app
 *   4. Download the JSON and save it as credentials/credentials.json
 *
 * NOTE: If you prefer a service account instead (no browser flow needed),
 *       create a service account, download the JSON as credentials/service-account.json,
 *       and share your Google Sheet with the service account email.  Then you
 *       do NOT need to run this file at all.
 */

'use strict';

const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');
const readline   = require('readline');

const SCOPES           = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'credentials.json');
const TOKEN_PATH       = path.join(__dirname, 'credentials', 'token.json');

if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error(
    'credentials/credentials.json not found.\n' +
    'Download it from Google Cloud Console → APIs & Services → Credentials\n' +
    '(OAuth 2.0 Client ID → Desktop app → Download JSON → rename to credentials.json)'
  );
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('\n─────────────────────────────────────────────────────────');
console.log('Open this URL in your browser and sign in with Google:\n');
console.log(authUrl);
console.log('\n─────────────────────────────────────────────────────────\n');

// Try to open the browser automatically (optional — may fail on headless servers)
try {
  const open = require('open');
  open(authUrl).catch(() => {});
} catch (_) {}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the authorization code here: ', (code) => {
  rl.close();
  oAuth2Client.getToken(code.trim(), (err, token) => {
    if (err) {
      console.error('Failed to retrieve token:', err.message);
      process.exit(1);
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
    console.log(`\n✓ Token saved to ${TOKEN_PATH}`);
    console.log('You can now run: node lead-gen.js   or   node scheduler.js');
  });
});
