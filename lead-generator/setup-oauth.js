/**
 * One-time Google OAuth setup script.
 * Run this ONCE to generate your GOOGLE_REFRESH_TOKEN, then add it to .env.
 *
 * Usage:
 *   1. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file
 *   2. Run: node setup-oauth.js
 *   3. Open the URL printed in the terminal
 *   4. Authorize the app in your browser
 *   5. Copy the code from the browser and paste it when prompted
 *   6. Copy the printed GOOGLE_REFRESH_TOKEN into your .env file
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

async function main() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in your .env file.');
    console.error('\nHow to get them:');
    console.error('  1. Go to https://console.cloud.google.com/');
    console.error('  2. Create a project (or select existing)');
    console.error('  3. Enable Google Sheets API and Google Drive API');
    console.error('  4. Go to Credentials → Create OAuth 2.0 Client ID');
    console.error('  5. Choose "Desktop app", download the JSON, copy client_id and client_secret here');
    process.exit(1);
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force refresh token to be returned
  });

  console.log('\n='.repeat(60));
  console.log('Google OAuth Setup');
  console.log('='.repeat(60));
  console.log('\n1. Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. Sign in with the Google account that owns your spreadsheet.');
  console.log('3. Click Allow to grant access.');
  console.log('4. Copy the authorization code shown in the browser.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('Paste the authorization code here: ', async (code) => {
    rl.close();

    try {
      const { tokens } = await auth.getToken(code.trim());

      if (!tokens.refresh_token) {
        console.error('\nError: No refresh token returned.');
        console.error('This can happen if you already authorized this app before.');
        console.error('Go to https://myaccount.google.com/permissions and remove access for your app, then run this script again.');
        process.exit(1);
      }

      console.log('\n='.repeat(60));
      console.log('SUCCESS — Add this to your .env file:');
      console.log('='.repeat(60));
      console.log(`\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      console.log('='.repeat(60));
      console.log('\nAfter adding it, run: node test-connection.js');
    } catch (err) {
      console.error('\nError exchanging authorization code:', err.message);
      process.exit(1);
    }
  });
}

main();
