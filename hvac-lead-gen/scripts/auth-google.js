/**
 * One-time Google OAuth2 setup script.
 *
 * Run once before using the workflow:
 *   npm run auth-google
 *
 * What it does:
 *   1. Reads your OAuth client credentials from credentials/credentials.json
 *   2. Opens (or prints) an authorization URL for you to visit in a browser
 *   3. Exchanges the code you paste for access + refresh tokens
 *   4. Saves the tokens to credentials/token.json
 *
 * After running this you should never need to run it again — the workflow
 * auto-refreshes tokens when they expire.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { google }   = require('googleapis');
const fs           = require('fs');
const path         = require('path');
const readline     = require('readline');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'credentials.json');
const TOKEN_PATH        = path.join(__dirname, '..', 'credentials', 'token.json');

// We only need Sheets read/write
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  // ── Preflight: check credentials.json ──────────────────────────────────────
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('\n❌  credentials.json not found.\n');
    console.error('Follow these steps to create it:\n');
    console.error('  1. Go to https://console.cloud.google.com/');
    console.error('  2. Create a project (or pick an existing one)');
    console.error('  3. Search for "Google Sheets API" and enable it');
    console.error('  4. Navigate to  APIs & Services → Credentials');
    console.error('  5. Click  "+ Create Credentials" → OAuth 2.0 Client ID');
    console.error('  6. Application type: Desktop app');
    console.error('  7. Download the JSON and save it as:\n');
    console.error(`     ${CREDENTIALS_PATH}\n`);
    console.error('Then re-run:  npm run auth-google\n');
    process.exit(1);
  }

  const raw   = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const creds = raw.installed || raw.web;

  if (!creds) {
    console.error('\n❌  credentials.json has an unexpected format.');
    console.error('    Expected a top-level "installed" or "web" key.\n');
    process.exit(1);
  }

  const { client_id, client_secret, redirect_uris } = creds;
  const oauth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // ── Generate auth URL ───────────────────────────────────────────────────────
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // ensures a refresh_token is always returned
  });

  console.log('\n══════════════════════════════════════════════');
  console.log('  Google OAuth2 Authorization');
  console.log('══════════════════════════════════════════════\n');
  console.log('Step 1 — Open this URL in your browser:\n');
  console.log(`  ${authUrl}\n`);
  console.log('Step 2 — Sign in with your Google account and click "Allow".');
  console.log('Step 3 — Copy the authorization code from the redirect page.\n');

  // ── Read the code from stdin ────────────────────────────────────────────────
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve =>
    rl.question('Paste the authorization code here: ', answer => {
      rl.close();
      resolve(answer.trim());
    })
  );

  if (!code) {
    console.error('\n❌  No code entered. Exiting.\n');
    process.exit(1);
  }

  // ── Exchange code for tokens ────────────────────────────────────────────────
  let tokens;
  try {
    const result = await oauth2.getToken(code);
    tokens = result.tokens;
  } catch (err) {
    console.error('\n❌  Token exchange failed:', err.message);
    console.error('    Make sure you copied the full authorization code.\n');
    process.exit(1);
  }

  // ── Save tokens ─────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  console.log('\n══════════════════════════════════════════════');
  console.log('  ✅  Authorization successful!');
  console.log('══════════════════════════════════════════════\n');
  console.log(`  Token saved to: ${TOKEN_PATH}\n`);
  console.log('Next steps:');
  console.log('  1. Copy .env.example to .env and fill in your values');
  console.log('  2. Run: npm run test-connection');
  console.log('  3. Run: npm run run-now   (to test a live pull)');
  console.log('  4. Run: npm start          (to start the daily scheduler)\n');
}

main().catch(err => {
  console.error('\n❌  Unexpected error:', err.message);
  process.exit(1);
});
