/**
 * Google OAuth Setup — run this ONCE to authorize the app.
 *
 * What it does:
 *   1. Reads your credentials.json (downloaded from Google Cloud Console)
 *   2. Opens a browser URL for you to approve access
 *   3. You paste back the auth code
 *   4. Saves token.json so index.js can run unattended forever after
 *
 * Usage:
 *   node setup-auth.js
 */

require('dotenv').config();

const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');
const readline   = require('readline');

const SCOPES            = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH  = process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, 'credentials.json');
const TOKEN_PATH        = process.env.GOOGLE_TOKEN_PATH       || path.join(__dirname, 'token.json');

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`\nERROR: credentials.json not found at: ${CREDENTIALS_PATH}`);
    console.error('\nTo fix this:');
    console.error('  1. Go to https://console.cloud.google.com/');
    console.error('  2. Create a project (or select an existing one)');
    console.error('  3. Enable the Google Sheets API');
    console.error('  4. Go to APIs & Services → Credentials');
    console.error('  5. Create an OAuth 2.0 Client ID (Desktop app type)');
    console.error('  6. Download the JSON and save it as: credentials.json in this folder');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const creds       = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0]
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'  // forces refresh_token to be included
  });

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('STEP 1: Open this URL in your browser to authorise access:');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`\n${authUrl}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => {
    rl.question('STEP 2: Paste the code from the browser here: ', resolve);
  });
  rl.close();

  const { tokens } = await oAuth2Client.getToken(code.trim());
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  console.log(`\n✓ token.json saved to: ${TOKEN_PATH}`);
  console.log('\nSetup complete! You can now run:');
  console.log('  npm run run-now    — to test a lead pull immediately');
  console.log('  npm start          — to start the daily 7am scheduler');
}

main().catch(err => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
