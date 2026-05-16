/**
 * auth.js — Run this ONCE to authorize your Google account.
 *
 * Usage:
 *   node auth.js
 *
 * It will open a browser window asking you to approve access to Google Sheets.
 * After you approve, the token is saved to token.json and you won't need to
 * run this again (the token refreshes automatically).
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.resolve('./credentials.json');
const TOKEN_PATH = path.resolve('./token.json');

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`\n  ERROR: credentials.json not found.`);
    console.error(`\n  Steps to get it:`);
    console.error(`    1. Go to https://console.cloud.google.com/`);
    console.error(`    2. Create a project (or select an existing one)`);
    console.error(`    3. Enable the "Google Sheets API"`);
    console.error(`    4. Go to APIs & Services → Credentials`);
    console.error(`    5. Create OAuth 2.0 Client ID → Desktop app`);
    console.error(`    6. Download the JSON and save it as credentials.json in this folder\n`);
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',   // ensures we get a refresh_token
    prompt: 'consent',        // forces refresh_token to be returned even on re-auth
    scope: SCOPES,
  });

  console.log('\n  Opening Google authorization page in your browser...');
  console.log(`\n  If the browser doesn't open automatically, paste this URL:\n`);
  console.log(`  ${authUrl}\n`);

  // Try to open the browser automatically
  try {
    const open = require('open');
    await open(authUrl);
  } catch (_) {
    // open is optional — user can paste the URL manually
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) => {
    rl.question('  Paste the authorization code from the browser here:\n  > ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\n  ✓ Token saved to token.json. You're authorized!\n`);
  console.log(`  Run the connection test next:\n`);
  console.log(`    npm run test-connection\n`);
}

main().catch((err) => {
  console.error('\n  Authorization failed:', err.message);
  process.exit(1);
});
