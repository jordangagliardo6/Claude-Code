/**
 * setup-google-auth.js — One-time interactive OAuth setup for Google Sheets.
 *
 * Run this once before starting the scheduler:
 *   node setup-google-auth.js
 *
 * It will print a URL, prompt you for the resulting auth code,
 * and save credentials/token.json.
 */

const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'credentials', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(' Google Sheets OAuth Setup');
  console.log('═'.repeat(60) + '\n');

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('ERROR: credentials.json not found.\n');
    console.log('How to get it:');
    console.log('  1. Go to https://console.cloud.google.com/');
    console.log('  2. Create (or select) a project');
    console.log('  3. Enable the Google Sheets API');
    console.log('  4. Go to APIs & Services → Credentials');
    console.log('  5. Create OAuth 2.0 Client ID → Desktop app');
    console.log('  6. Download the JSON file');
    console.log(`  7. Save it as: ${CREDENTIALS_PATH}\n`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const creds = raw.installed || raw.web;
  if (!creds) {
    console.error('ERROR: credentials.json format not recognized. Expected "installed" or "web" key.');
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0]
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // force refresh_token to be returned
  });

  console.log('Step 1 — Open this URL in your browser:\n');
  console.log('  ' + authUrl);
  console.log('\nStep 2 — Sign in with your Google account and click Allow.');
  console.log('Step 3 — Copy the authorization code from the redirect page.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('Paste the authorization code here and press Enter: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log(`\n✓ Token saved to ${TOKEN_PATH}`);
      console.log('✓ Google Sheets is now authorized!\n');
      console.log('Next step: run the connection test:');
      console.log('  npm run test-connection\n');
    } catch (err) {
      console.error('\n✗ Failed to exchange code for token:', err.message);
      console.log('\nTroubleshooting:');
      console.log('  - Make sure you copied the full code from the browser');
      console.log('  - Auth codes expire quickly — re-run this script to get a new URL');
    }
  });
}

main();
