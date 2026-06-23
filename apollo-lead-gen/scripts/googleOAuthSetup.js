// ---------------------------------------------------------------------------
// One-time interactive setup: generates a Google OAuth refresh token and
// prints it for you to paste into .env as GOOGLE_REFRESH_TOKEN.
//
// Prerequisite: a Google Cloud OAuth client of type "Desktop app" with
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET already set in .env.
// See README.md "Google OAuth setup" for how to create one.
//
// Run with: npm run google-auth
// ---------------------------------------------------------------------------

require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const REDIRECT_PORT = 4567;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // required to get a refresh_token
    prompt: 'consent', // forces a refresh_token even on repeat runs
    scope: SCOPES,
  });

  console.log('1. Open this URL in your browser and approve access:\n');
  console.log(authUrl);
  console.log('\n2. Waiting for the redirect back to localhost...\n');

  const code = await waitForAuthCode();

  const { tokens } = await oAuth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh_token was returned. This usually means you previously authorized this app ' +
        'without revoking it. Go to https://myaccount.google.com/permissions, remove access for ' +
        'this app, then run `npm run google-auth` again.'
    );
    process.exit(1);
  }

  console.log('\nSuccess! Add this line to your .env file:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  process.exit(0);
}

function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url, REDIRECT_URI);
      if (reqUrl.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        error
          ? '<h1>Authorization failed</h1><p>You can close this tab and check the terminal.</p>'
          : '<h1>Authorization complete</h1><p>You can close this tab and return to the terminal.</p>'
      );

      server.close();
      if (error) reject(new Error(error));
      else resolve(code);
    });

    server.listen(REDIRECT_PORT);
  });
}

main().catch((err) => {
  console.error('OAuth setup failed:', err.message);
  process.exit(1);
});
