'use strict';

// ============================================================
// Google OAuth Setup — run this ONCE before starting the scheduler
//
// Usage: node setup-google-auth.js
//
// What it does:
//   1. Reads your OAuth credentials from GOOGLE_CREDENTIALS in .env
//   2. Opens an authorization URL (or prints it for you to open)
//   3. Asks you to paste the authorization code
//   4. Saves the refresh token to google-token.json
//
// After this runs successfully, the main script handles token
// refresh automatically — you never need to run this again.
// ============================================================

require('dotenv').config();

const { google } = require('googleapis');
const readline  = require('readline');
const fs        = require('fs');
const path      = require('path');

const TOKEN_PATH = path.join(__dirname, 'google-token.json');

// Only needs Sheets access (read + write)
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS;

  if (!credentialsJson) {
    console.error('\n❌ GOOGLE_CREDENTIALS is not set in your .env file.\n');
    console.log('How to get it:');
    console.log('  1. Go to https://console.cloud.google.com/');
    console.log('  2. Create a new project (or use an existing one)');
    console.log('  3. Enable the "Google Sheets API" for that project');
    console.log('  4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID');
    console.log('  5. Application type: Desktop app');
    console.log('  6. Download the JSON file');
    console.log('  7. Open the JSON file, copy all its contents');
    console.log('  8. In your .env file, paste it as: GOOGLE_CREDENTIALS={"installed":...}');
    console.log('\nThen re-run: node setup-google-auth.js\n');
    process.exit(1);
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    console.error('\n❌ GOOGLE_CREDENTIALS is not valid JSON. Check your .env file.\n');
    process.exit(1);
  }

  const { client_id, client_secret, redirect_uris } =
    credentials.installed || credentials.web;

  if (!client_id || !client_secret) {
    console.error('\n❌ Could not find client_id/client_secret in GOOGLE_CREDENTIALS.\n');
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',  // gets a refresh token so we never need to re-auth
    scope: SCOPES,
    prompt: 'consent',       // force consent screen to always return refresh_token
  });

  console.log('\n══════════════════════════════════════════════');
  console.log(' Google Sheets Authorization — One-Time Setup');
  console.log('══════════════════════════════════════════════\n');
  console.log('Step 1 — Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nStep 2 — Sign in with your Google account and click Allow');
  console.log('Step 3 — You will be redirected to a page showing an authorization code');
  console.log('         (or shown inline if it says "This site can\'t be reached")\n');

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  rl.question('Paste the authorization code here and press Enter:\n> ', async (code) => {
    rl.close();

    if (!code || !code.trim()) {
      console.error('\n❌ No code entered. Exiting.\n');
      process.exit(1);
    }

    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      oAuth2Client.setCredentials(tokens);

      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

      console.log('\n✅ Authorization successful!');
      console.log(`   Token saved to: ${TOKEN_PATH}`);
      console.log('\nYou can now run the lead generator:');
      console.log('   npm start              — start the daily scheduler');
      console.log('   npm run run-now        — pull leads right now (test run)');
      console.log('   npm run verify         — confirm both connections are working\n');
    } catch (err) {
      console.error(`\n❌ Failed to exchange code for token: ${err.message}`);
      console.error('   Make sure you pasted the code correctly and try again.\n');
      process.exit(1);
    }
  });
}

main();
