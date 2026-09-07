// One-time OAuth2 authorization helper.
// Run this ONCE to get a refresh token, then add it to .env.
// After that you won't need this script again — the main script uses the token.
//
// Usage:
//   1. Fill in CLIENT_ID and CLIENT_SECRET below (from Google Cloud Console)
//   2. node auth-helper.js
//   3. Open the printed URL in your browser and authorize
//   4. Paste the code shown in the browser back into the terminal
//   5. Copy the refresh_token into your .env file

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'PASTE_YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'PASTE_YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Desktop app flow (no local server needed)

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/spreadsheets'],
  prompt: 'consent', // force refresh_token to be returned even if already authorized
});

console.log('\n1. Open this URL in your browser:\n');
console.log('   ' + authUrl);
console.log('\n2. Authorize the app, then paste the code below:\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('   Authorization code: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\n✅ Success! Add these to your .env file:\n');
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nDone — you can delete this helper script if you like.\n');
  } catch (err) {
    console.error('\n❌ Failed to exchange code:', err.message);
    process.exit(1);
  }
});
