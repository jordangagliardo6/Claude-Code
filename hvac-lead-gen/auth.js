/**
 * auth.js — One-time Google OAuth2 authorization script.
 *
 * Run this ONCE before starting the scheduler:
 *   node auth.js
 *
 * It will:
 *   1. Open a Google authorization URL (you paste it into your browser)
 *   2. Ask you to paste back the authorization code
 *   3. Save the token to credentials/token.json
 *
 * After this, index.js will refresh the token automatically — you won't
 * need to run auth.js again unless you delete token.json or revoke access.
 *
 * Prerequisites:
 *   • Download your OAuth2 client credentials JSON from Google Cloud Console
 *     (APIs & Services → Credentials → OAuth 2.0 Client IDs → Download JSON)
 *   • Save it as: credentials/google-credentials.json
 */

require('dotenv').config();

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'google-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'credentials', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function authorize() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Google Sheets Authorization — HVAC Lead Gen');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Load credentials ──────────────────────────────────────────────────────
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`ERROR: Credentials file not found at:\n  ${CREDENTIALS_PATH}\n`);
    console.error('Steps to fix:');
    console.error('  1. Go to https://console.cloud.google.com/apis/credentials');
    console.error('  2. Create or select a project, then enable the Google Sheets API');
    console.error('  3. Create an OAuth 2.0 Client ID (Desktop app type)');
    console.error('  4. Download the JSON and save it as:');
    console.error(`     ${CREDENTIALS_PATH}\n`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const creds = raw.installed || raw.web;

  if (!creds) {
    console.error('ERROR: Credentials file does not contain an "installed" or "web" key.');
    console.error('Make sure you downloaded an OAuth 2.0 Client ID (not a service account).\n');
    process.exit(1);
  }

  const auth = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris[0]
  );

  // ── Generate auth URL ─────────────────────────────────────────────────────
  const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('Step 1 — Open this URL in your browser:\n');
  console.log(`  ${authUrl}\n`);
  console.log('Step 2 — Sign in with the Google account that owns your leads spreadsheet.');
  console.log('Step 3 — Click "Allow" to grant spreadsheet access.');
  console.log('Step 4 — Copy the authorization code shown on the page.\n');

  // ── Prompt for code ───────────────────────────────────────────────────────
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve =>
    rl.question('Paste the authorization code here: ', answer => {
      rl.close();
      resolve(answer.trim());
    })
  );

  if (!code) {
    console.error('\nNo code entered. Aborting.\n');
    process.exit(1);
  }

  // ── Exchange code for token ───────────────────────────────────────────────
  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);

  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  console.log(`\n✓ Token saved to ${TOKEN_PATH}`);
  console.log('  The token includes a refresh_token — it will auto-renew forever.\n');
  console.log('You are ready to run the scheduler:');
  console.log('  node index.js --verify    ← test both connections first');
  console.log('  node index.js --run-now   ← run once immediately');
  console.log('  node index.js             ← start the daily 7am cron\n');
}

authorize().catch(err => {
  console.error('\nAuthorization failed:', err.message);
  process.exit(1);
});
