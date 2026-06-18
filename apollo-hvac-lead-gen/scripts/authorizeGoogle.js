// One-time setup: connects your Google account and saves a reusable token.
// Run with: npm run auth
//
// Prerequisite: download an OAuth client ID (type "Desktop app") from
// https://console.cloud.google.com -> APIs & Services -> Credentials, and
// save the downloaded JSON as credentials.json in this folder (or point
// GOOGLE_OAUTH_CREDENTIALS_PATH at it).

const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');
const config = require('../config');

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}`;

async function main() {
  if (!fs.existsSync(config.googleOauthCredentialsPath)) {
    console.error(
      `Could not find ${config.googleOauthCredentialsPath}. Download a "Desktop app" OAuth ` +
        'client from Google Cloud Console and save it at that path first.'
    );
    process.exit(1);
  }

  const { client_id, client_secret } = JSON.parse(
    fs.readFileSync(config.googleOauthCredentialsPath, 'utf8')
  ).installed;

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token to be issued every time
    scope: config.googleScopes,
  });

  console.log('\n1. Open this URL in a browser and approve access:\n');
  console.log(authUrl);
  console.log('\n2. You will be redirected to localhost -- this script is waiting for that.\n');

  const code = await waitForAuthCode();
  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: REDIRECT_URI });

  fs.writeFileSync(config.googleOauthTokenPath, JSON.stringify(tokens, null, 2));
  console.log(`\nSaved credentials to ${config.googleOauthTokenPath}. You're connected to Google.`);
}

function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.end(error ? 'Authorization failed. You can close this tab.' : 'Success! You can close this tab.');
      server.close();

      if (error) reject(new Error(error));
      else resolve(code);
    });
    server.listen(PORT);
  });
}

main().catch((error) => {
  console.error('Google authorization failed:', error.message);
  process.exit(1);
});
