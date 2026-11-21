/**
 * Run this ONCE before the first scheduled run to authorize Google Sheets access.
 * Usage: node auth.js
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project, enable "Google Sheets API"
 *   3. Create OAuth2 credentials (type: Desktop app)
 *   4. Download the credentials JSON and save it as credentials.json in this folder
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('ERROR: credentials.json not found.');
    console.error('Download it from Google Cloud Console → APIs & Services → Credentials.');
    console.error(`Expected location: ${CREDENTIALS_PATH}`);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n=== Google Sheets Authorization ===');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter approving, paste the authorization code below:');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('\nAuthorization code: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('\n✓ token.json saved. You are authorized.');
      console.log('You can now run: npm start');
    } catch (err) {
      console.error('ERROR getting token:', err.message);
    }
  });
}

main();
