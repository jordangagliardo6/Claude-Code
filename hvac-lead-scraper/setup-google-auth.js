/**
 * setup-google-auth.js — One-time OAuth2 authorization for Google Sheets
 *
 * Run this ONCE before starting the scheduler:
 *   npm run setup-google-auth
 *
 * It will open a browser URL, ask you to paste the authorization code,
 * and save a token.json that the main script uses for all future runs.
 *
 * If you are using a service account instead of OAuth2, skip this file —
 * just place your service account credentials.json in this directory.
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('ERROR: credentials.json not found in this directory.\n');
    console.error('Steps to get it:');
    console.error('  1. Go to https://console.cloud.google.com');
    console.error('  2. Create a project (or select an existing one)');
    console.error('  3. Enable the "Google Sheets API"');
    console.error('  4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID');
    console.error('  5. Choose "Desktop application"');
    console.error('  6. Download the JSON file and rename it credentials.json');
    console.error('  7. Place it in this directory, then re-run: npm run setup-google-auth\n');
    console.error('Alternative: use a Service Account instead (better for automation):');
    console.error('  Create a Service Account key JSON, save as credentials.json here,');
    console.error('  and share your Google Sheet with the service account email address.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

  // Support both "installed" (Desktop app) and "web" credential shapes
  const clientInfo = raw.installed ?? raw.web;
  if (!clientInfo) {
    console.error('ERROR: credentials.json does not look like an OAuth2 client file.');
    console.error('Make sure you downloaded "OAuth 2.0 Client ID" credentials (not a service account).');
    process.exit(1);
  }

  if (raw.type === 'service_account') {
    console.log('This is a service account credentials file.');
    console.log('You do NOT need to run setup-google-auth.js for service accounts.');
    console.log('Just make sure your Google Sheet is shared with this service account email:');
    console.log(' ', raw.client_email);
    process.exit(0);
  }

  const oauth2 = new google.auth.OAuth2(
    clientInfo.client_id,
    clientInfo.client_secret,
    clientInfo.redirect_uris?.[0] ?? 'urn:ietf:wg:oauth:2.0:oob'
  );

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // ensures refresh_token is always returned
  });

  console.log('\nStep 1: Open this URL in your browser and authorize the app:\n');
  console.log(authUrl);
  console.log('\nStep 2: After authorizing, Google will show you a code.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste the authorization code here and press Enter: ', async code => {
    rl.close();
    try {
      const { tokens } = await oauth2.getToken(code.trim());
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('\n✓ token.json saved successfully.');
      console.log('\nNext step — verify both connections:');
      console.log('  npm run test-connections');
    } catch (err) {
      console.error('\nFailed to exchange code for token:', err.message);
      console.error('Make sure you pasted the full code without extra spaces, and try again.');
      process.exit(1);
    }
  });
}

main();
