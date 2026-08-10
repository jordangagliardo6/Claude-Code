/**
 * auth.js — One-time OAuth2 authorization flow for Google Sheets
 *
 * Run this ONCE to generate google-token.json, which is then used
 * by the lead generator for all future requests without browser prompts.
 *
 * Usage:
 *   1. Download credentials.json from Google Cloud Console
 *   2. Place it in this directory
 *   3. Run: node auth.js
 *   4. Open the printed URL in your browser and authorize
 *   5. Paste the code back into the terminal
 *
 * NOTE: Skip this entirely if you're using a Service Account key file.
 */

'use strict';
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

require('dotenv').config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CRED_PATH = process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || path.join(__dirname, 'credentials.json');
const TOKEN_PATH = process.env.GOOGLE_OAUTH_TOKEN_PATH || path.join(__dirname, 'google-token.json');

if (!fs.existsSync(CRED_PATH)) {
  console.error(`credentials.json not found at ${CRED_PATH}`);
  console.error('Download it from: Google Cloud Console → APIs → Credentials → OAuth 2.0 Client IDs');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
const cred = raw.installed || raw.web;
const oAuth2Client = new google.auth.OAuth2(
  cred.client_id,
  cred.client_secret,
  cred.redirect_uris[0]
);

const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
console.log('\nOpen this URL in your browser to authorize:\n');
console.log(authUrl);
console.log();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the authorization code here: ', (code) => {
  rl.close();
  oAuth2Client.getToken(code.trim(), (err, token) => {
    if (err) { console.error('Error getting token:', err); process.exit(1); }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
    console.log(`\n✅ Token saved to ${TOKEN_PATH}`);
    console.log('You can now run: npm start');
  });
});
