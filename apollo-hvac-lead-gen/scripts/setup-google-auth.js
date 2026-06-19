// One-time interactive OAuth flow that authorizes this app against your
// Google account and saves a refresh token to token.json. Run once with
// `npm run setup-google-auth` before the first scheduled run.
require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');
const REDIRECT_URI = 'http://localhost:53682/oauth2callback';

async function main() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // required to receive a refresh token
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('1. Open this URL in your browser and approve access with the Google account');
  console.log('   that owns (or can edit) your leads spreadsheet:\n');
  console.log(authUrl, '\n');
  console.log('2. Waiting for the redirect back to localhost:53682 ...');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const authCode = url.searchParams.get('code');
      if (authCode) {
        res.end('Authentication successful! You can close this tab and return to the terminal.');
        server.close();
        resolve(authCode);
      } else {
        res.end('No authorization code found in the callback URL.');
      }
    });
    server.listen(53682);
    server.on('error', reject);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\nSaved Google OAuth token to ${TOKEN_PATH}`);
  console.log('Next: run `npm run test-connections` to confirm everything is wired up.');
}

main().catch((err) => {
  console.error('OAuth setup failed:', err.message);
  process.exit(1);
});
