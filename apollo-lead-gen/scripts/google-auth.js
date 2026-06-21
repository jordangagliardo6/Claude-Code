#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-time setup script: walks you through the Google OAuth consent screen
// and prints a refresh token to paste into .env as GOOGLE_REFRESH_TOKEN.
// You only need to run this once per Google account (and again if you ever
// revoke access). Run with: npm run auth:google
// ---------------------------------------------------------------------------
require('dotenv').config();
const readline = require('node:readline');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env before running this script.');
    console.error('See README.md "Google OAuth setup" for how to get these from Google Cloud Console.');
    process.exit(1);
  }

  // "urn:ietf:wg:oauth:2.0:oob" lets this be a copy/paste flow with no
  // localhost redirect server needed, which works in any environment
  // (including headless servers where this cron job will eventually run).
  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token to be issued every time
    scope: SCOPES,
  });

  console.log('\n1. Open this URL in a browser and sign in with the Google account');
  console.log('   that owns (or has edit access to) your lead-tracking spreadsheet:\n');
  console.log(`   ${authUrl}\n`);
  console.log('2. Approve access, then copy the code Google shows you.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) => rl.question('Paste the code here: ', resolve));
  rl.close();

  const { tokens } = await oAuth2Client.getToken(code.trim());

  if (!tokens.refresh_token) {
    console.error('\nGoogle did not return a refresh token. This usually means the account');
    console.error('already had a token issued for this app. Revoke access at');
    console.error('https://myaccount.google.com/permissions and run this script again.');
    process.exit(1);
  }

  console.log('\nSuccess! Add this line to your .env file:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch((err) => {
  console.error('Google auth setup failed:', err.message);
  process.exit(1);
});
