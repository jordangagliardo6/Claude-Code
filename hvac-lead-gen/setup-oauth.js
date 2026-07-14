/**
 * One-time OAuth2 setup for personal Google accounts.
 *
 * Only needed if you're using an OAuth2 credentials.json instead of a service account.
 * Service account users can skip this file entirely.
 *
 * Run once:  npm run setup-oauth
 *
 * It will:
 *   1. Read credentials/credentials.json  (your OAuth2 client secrets)
 *   2. Open a browser to authorize access to your Google Sheets
 *   3. Save the resulting token to credentials/token.json
 *   4. Future runs will auto-refresh the token — you won't need to do this again
 */

require('dotenv').config();

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');

const CREDENTIALS_PATH = path.resolve('./credentials/credentials.json');
const TOKEN_PATH = path.resolve('./credentials/token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

(async () => {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`\nCredentials file not found: ${CREDENTIALS_PATH}`);
    console.error(
      '\nTo get one:\n' +
      '  1. Go to https://console.cloud.google.com/apis/credentials\n' +
      '  2. Create an OAuth 2.0 Client ID (Desktop app type)\n' +
      '  3. Download the JSON and save it to credentials/credentials.json\n'
    );
    process.exit(1);
  }

  const rawCreds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const appCreds = rawCreds.installed || rawCreds.web;
  if (!appCreds) {
    console.error('credentials.json does not contain an "installed" or "web" OAuth2 client.');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    appCreds.client_id,
    appCreds.client_secret,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\nAuthorize this app by opening the URL below in your browser:\n');
  console.log(`  ${authUrl}\n`);

  // Start a temporary local server to capture the OAuth2 callback
  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/oauth2callback') return;

      const code = parsed.query.code;
      if (!code) {
        res.end('Authorization failed — no code received.');
        return reject(new Error('No authorization code received'));
      }

      try {
        const { tokens } = await oauth2Client.getToken(code);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log(`\nToken saved to ${TOKEN_PATH}`);
        console.log('\nSetup complete! You can now run the workflow:');
        console.log('  npm run run-now       — test one cycle immediately');
        console.log('  npm start             — start the daily scheduler');
        res.end('Authorization successful — you can close this tab.');
        server.close();
        resolve();
      } catch (err) {
        res.end(`Error: ${err.message}`);
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`Waiting for authorization callback on port ${REDIRECT_PORT}...`);
    });

    server.on('error', reject);
  });
})();
