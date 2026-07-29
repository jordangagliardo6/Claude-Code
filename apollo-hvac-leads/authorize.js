/**
 * authorize.js — One-time Google OAuth2 setup.
 *
 * Run this ONCE before the first scheduled run:
 *   node authorize.js
 *
 * It will print a URL. Open it, sign in with the Google account that owns
 * your spreadsheet, approve access, then paste the code back here.
 * A token.json file is created and reused automatically from then on.
 */

require('dotenv').config();

const { google }  = require('googleapis');
const readline    = require('readline');
const fs          = require('fs');
const path        = require('path');

const SCOPES           = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH       = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(
      '\n✗ credentials.json not found.\n\n' +
      'Steps to create it:\n' +
      '  1. Go to https://console.cloud.google.com/\n' +
      '  2. Create a project (or select an existing one)\n' +
      '  3. Enable the Google Sheets API:\n' +
      '     APIs & Services → Library → search "Google Sheets API" → Enable\n' +
      '  4. Create OAuth credentials:\n' +
      '     APIs & Services → Credentials → Create Credentials → OAuth client ID\n' +
      '     Application type: Desktop app\n' +
      '  5. Download the JSON and save it as credentials.json in this folder\n'
    );
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const cfg = raw.installed ?? raw.web;

  const oAuth2Client = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    cfg.redirect_uris[0]
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES,
  });

  console.log('\n=== Google Sheets Authorization ===\n');
  console.log('1. Open this URL in your browser:\n');
  console.log('   ' + authUrl + '\n');
  console.log('2. Sign in with the Google account that owns your spreadsheet.');
  console.log('3. Click "Allow" to grant Sheets access.');
  console.log('4. Copy the authorization code shown in the browser.\n');

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  rl.question('Paste the authorization code here and press Enter: ', async code => {
    rl.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('\n✓ token.json saved. Your workflow is now authorized.\n');
      console.log('Next steps:');
      console.log('  • Edit .env and set GOOGLE_SPREADSHEET_ID');
      console.log('  • Run "npm run run-now" to test the first pull');
      console.log('  • Run "npm start" to start the 7 AM daily scheduler\n');
    } catch (err) {
      console.error('\n✗ Failed to exchange code for token:', err.message);
      process.exit(1);
    }
  });
}

main();
