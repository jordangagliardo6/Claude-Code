// One-time setup script: walks you through Google's OAuth consent flow and saves
// a refresh token to token.json so the workflow can write to your sheet without
// you logging in again. Run with: npm run authorize
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TOKEN_PATH = path.join(__dirname, '..', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function authorize() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file first.');
    process.exit(1);
  }

  const redirectUri = GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';
  const port = Number(new URL(redirectUri).port) || 3000;
  const oAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\n1. Open this URL in a browser and approve access for your Google account:\n');
  console.log(authUrl);
  console.log('\n2. After approving, you will be redirected back here automatically.\n');

  const code = await waitForAuthCode(port);
  const { tokens } = await oAuth2Client.getToken(code);

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\nSuccess! Token saved to ${TOKEN_PATH} (this file is gitignored - keep it secret).`);
  if (tokens.refresh_token) {
    console.log(
      `\nIf you'd rather not keep token.json around, you can instead copy this into ` +
        `.env as GOOGLE_REFRESH_TOKEN:\n${tokens.refresh_token}\n`
    );
  }
}

function waitForAuthCode(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      if (code) {
        res.end('Authorization successful! You can close this tab and return to the terminal.');
        server.close();
        resolve(code);
      } else {
        res.end('No authorization code found in the request.');
      }
    });
    server.listen(port);
    server.on('error', reject);
  });
}

authorize();
