/**
 * One-time helper to generate a Google OAuth refresh token for the Sheets
 * API. Run this once after creating your OAuth client ID/secret (Desktop
 * app type) in Google Cloud Console.
 *
 * Usage: npm run get-google-token
 *
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to already be set in
 * .env. Prints the refresh token to paste into GOOGLE_REFRESH_TOKEN.
 */

require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const REDIRECT_URI = 'http://localhost:53682/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token to be returned even on repeat runs
    scope: SCOPES,
  });

  console.log('1. Open this URL in a browser and approve access with the Google account that owns the sheet:\n');
  console.log(authUrl);
  console.log('\n2. Waiting for the redirect back to localhost...\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get('code');
      if (code) {
        res.end('Success! You can close this tab and return to the terminal.');
        server.close();
        resolve(code);
      } else {
        res.end('No authorization code found in the request.');
      }
    });
    server.on('error', reject);
    server.listen(53682);
  });

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh_token was returned. This usually happens if you previously authorized this app — ' +
        'revoke access at https://myaccount.google.com/permissions and run this script again.'
    );
    process.exit(1);
  }

  console.log('\nSuccess! Add this to your .env file:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch((err) => {
  console.error('Failed to get refresh token:', err);
  process.exit(1);
});
