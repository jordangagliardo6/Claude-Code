/**
 * One-time Google OAuth2 setup.
 * Run `node auth.js` once to authorize Google Sheets access and get your refresh token.
 * Paste the refresh token into your .env file as GOOGLE_REFRESH_TOKEN.
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline  = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob',
);

const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

console.log('\n=== Google Sheets — One-Time Authorization ===');
console.log('1. Open this URL in your browser:\n');
console.log('   ' + authUrl + '\n');
console.log('2. Sign in with the Google account that owns your spreadsheet.');
console.log('3. Copy the authorization code shown on the page.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await auth.getToken(code.trim());
    console.log('\n✅  Authorization successful!\n');
    console.log('Add this line to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (err) {
    console.error('Authorization failed:', err.message);
    process.exit(1);
  }
});
