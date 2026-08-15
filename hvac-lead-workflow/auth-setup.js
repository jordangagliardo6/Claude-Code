/**
 * Google OAuth2 Setup Helper
 *
 * Run this once to get your GOOGLE_REFRESH_TOKEN:
 *   node auth-setup.js
 *
 * Prerequisites:
 *   1. Create a Google Cloud project and enable the Google Sheets API
 *   2. Create OAuth 2.0 credentials (Application type: Desktop app)
 *   3. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file
 */

'use strict';

require('dotenv').config();
const { google } = require('googleapis');
const readline   = require('readline');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
  console.error('See .env.example for instructions on getting these values.');
  process.exit(1);
}

const auth = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob' // out-of-band — no redirect server needed
);

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
];

const authUrl = auth.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // force refresh_token to be returned
});

console.log('\n=== Google OAuth2 Setup ===\n');
console.log('1. Open this URL in your browser:');
console.log('\n  ', authUrl, '\n');
console.log('2. Sign in with the Google account that owns the SW Michigan HVAC Leads sheet.');
console.log('3. Click "Allow" to grant Sheets access.');
console.log('4. Copy the authorization code shown on the next page.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await auth.getToken(code.trim());
    console.log('\n✓ Success! Add this line to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nThen run: npm run setup  (to verify everything is connected)');
  } catch (err) {
    console.error('\nFailed to exchange code for tokens:', err.message);
    console.error('Double-check that you copied the full authorization code.');
    process.exit(1);
  }
});
