/**
 * One-time Google OAuth2 setup script.
 * Run this ONCE before starting the cron job to authorize Google Sheets access.
 *
 * Usage: node auth.js
 * It will print a URL — open it in your browser, approve access, paste the code back.
 * Copy the printed refresh token into your .env file as GOOGLE_REFRESH_TOKEN.
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('\n=== Google OAuth2 Setup ===');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Approve access, then paste the code below:\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Enter the authorization code: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n=== SUCCESS ===');
    console.log('Add this to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (err) {
    console.error('Error getting tokens:', err.message);
  }
});
