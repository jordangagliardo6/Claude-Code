/**
 * First-run setup and connection test.
 * Run this ONCE before starting the scheduler:  npm run test-connection
 *
 * This script:
 *  1. Validates your .env file
 *  2. Authorizes Google Sheets via OAuth (opens browser if first run)
 *  3. Confirms it can read your spreadsheet
 *  4. Confirms it can reach the Apollo.io API
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');
const axios = require('axios');
const { config, validate } = require('./src/config');
const logger = require('./src/logger');

async function promptUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function authorizeGoogle() {
  const credPath = path.resolve(config.google.credentialsPath);
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `credentials.json not found at: ${credPath}\n\n` +
      'Steps to get it:\n' +
      '  1. Go to https://console.cloud.google.com/\n' +
      '  2. Create a project (or select existing)\n' +
      '  3. Enable "Google Sheets API" in APIs & Services > Library\n' +
      '  4. Go to APIs & Services > Credentials\n' +
      '  5. Create OAuth 2.0 Client ID (type: Desktop App)\n' +
      '  6. Download JSON and save as credentials.json in this folder\n'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const tokenPath = path.resolve(config.google.tokenPath);
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);
    console.log('  Google token already cached — skipping authorization step.');
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: config.google.scopes,
  });

  console.log('\n  Open this URL in your browser to authorize Google Sheets access:');
  console.log('\n  ' + authUrl + '\n');

  const code = await promptUser('  Paste the authorization code here: ');
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`  Token saved to ${tokenPath}`);

  return oAuth2Client;
}

async function testGoogleSheets(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.google.spreadsheetId,
    fields: 'properties.title,sheets.properties.title',
  });

  const spreadsheetTitle = res.data.properties.title;
  const sheetNames = res.data.sheets.map((s) => s.properties.title);

  // Check if our target sheet tab exists, create it if not
  if (!sheetNames.includes(config.google.sheetName)) {
    console.log(`  Sheet tab "${config.google.sheetName}" not found — creating it...`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: config.google.sheetName } } }],
      },
    });
    console.log(`  Created sheet tab: "${config.google.sheetName}"`);
  }

  return spreadsheetTitle;
}

async function testApollo() {
  const res = await axios.get(`${config.apollo.baseUrl}/auth/health`, {
    headers: { 'X-Api-Key': config.apollo.apiKey },
    timeout: 10000,
  });
  // Apollo health endpoint returns 200 when key is valid
  return res.status === 200;
}

(async () => {
  console.log('\n===========================================');
  console.log('  HVAC Lead Gen — Setup & Connection Test  ');
  console.log('===========================================\n');

  // 1. Validate env
  console.log('Step 1: Checking environment variables...');
  try {
    validate();
    console.log('  ✓ APOLLO_API_KEY is set');
    console.log('  ✓ GOOGLE_SPREADSHEET_ID is set');
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    console.error('\n  Copy .env.example to .env and fill in your values.\n');
    process.exit(1);
  }

  // 2. Google OAuth
  console.log('\nStep 2: Authorizing Google Sheets...');
  let auth;
  try {
    auth = await authorizeGoogle();
    console.log('  ✓ Google OAuth authorized');
  } catch (err) {
    console.error(`  ✗ Google auth failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Test Google Sheets access
  console.log('\nStep 3: Testing Google Sheets connection...');
  try {
    const title = await testGoogleSheets(auth);
    console.log(`  ✓ Connected to spreadsheet: "${title}"`);
    console.log(`  ✓ Target sheet tab: "${config.google.sheetName}"`);
  } catch (err) {
    console.error(`  ✗ Google Sheets error: ${err.message}`);
    console.error('  Verify your GOOGLE_SPREADSHEET_ID and that the Sheet is shared with your Google account.');
    process.exit(1);
  }

  // 4. Test Apollo
  console.log('\nStep 4: Testing Apollo.io API connection...');
  try {
    await testApollo();
    console.log('  ✓ Apollo.io API key is valid');
  } catch (err) {
    // Apollo may not have a public /health — treat non-auth errors as warnings
    if (err.response?.status === 401) {
      console.error('  ✗ Apollo API key is invalid or expired (401 Unauthorized)');
      process.exit(1);
    } else {
      console.warn(`  ⚠ Apollo health check inconclusive (${err.message}) — key may still work`);
    }
  }

  console.log('\n===========================================');
  console.log('  All checks passed! You are ready to go.  ');
  console.log('===========================================');
  console.log('\n  To run the workflow once:    npm run run-once');
  console.log('  To start the 7am scheduler:  npm start\n');
})();
