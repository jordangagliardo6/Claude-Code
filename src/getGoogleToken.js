/**
 * One-time helper to obtain a Google OAuth2 refresh token.
 *
 * Usage:
 *   1. Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in .env
 *   2. node src/getGoogleToken.js
 *   3. Open the printed URL in your browser and authorize
 *   4. Paste the code from the redirect URL when prompted
 *   5. Copy the printed refresh_token into your .env as GOOGLE_REFRESH_TOKEN
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
];

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

const url = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
console.log('\nOpen this URL in your browser:\n');
console.log(url);
console.log();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  const { tokens } = await auth.getToken(code);
  console.log('\nYour refresh token (add to .env as GOOGLE_REFRESH_TOKEN):\n');
  console.log(tokens.refresh_token);
});
