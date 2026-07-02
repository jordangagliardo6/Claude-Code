'use strict';
/**
 * One-time Google OAuth2 authorization.
 * Run ONCE before using the scheduler: npm run authorize
 *
 * What this does:
 *   1. Opens a browser URL for you to approve Google Sheets access
 *   2. Asks you to paste the authorization code back into the terminal
 *   3. Saves the token to token.json (auto-refreshed on future runs)
 */
require('dotenv').config();
const { google }  = require('googleapis');
const fs          = require('fs');
const path        = require('path');
const readline    = require('readline');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH       = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  // ── Check credentials.json exists ──────────────────────────────────────────
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('\nERROR: credentials.json not found.\n');
    console.error('To create it:');
    console.error('  1. Go to https://console.cloud.google.com/');
    console.error('  2. Select (or create) a project');
    console.error('  3. APIs & Services → Enable APIs → enable "Google Sheets API"');
    console.error('  4. APIs & Services → Credentials → Create Credentials → OAuth client ID');
    console.error('  5. Application type: Desktop app  (name it anything)');
    console.error('  6. Download the JSON → save it as credentials.json in this folder');
    console.error('  7. Run: npm run authorize\n');
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // ── Generate consent URL ────────────────────────────────────────────────────
  const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\n── Google OAuth2 Authorization ──────────────────────────────────\n');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter you approve, Google will show you an authorization code.');
  console.log('Paste it below and press Enter.\n');

  const rl   = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('Authorization code: ', resolve));
  rl.close();

  // ── Exchange code for tokens ────────────────────────────────────────────────
  const { tokens } = await auth.getToken(code.trim());
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  console.log(`\nTokens saved to ${TOKEN_PATH}`);
  console.log('Authorization complete!\n');
  console.log('Next steps:');
  console.log('  npm run verify      ← confirms both Apollo and Sheets are connected');
  console.log('  npm run run-now     ← runs one full lead gen cycle immediately');
  console.log('  npm start           ← starts the daily 7 AM scheduler\n');
}

main().catch(err => {
  console.error('Authorization failed:', err.message);
  process.exit(1);
});
