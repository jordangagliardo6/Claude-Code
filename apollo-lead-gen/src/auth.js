'use strict';

/**
 * Google authentication helper.
 *
 * Supports two auth methods controlled by GOOGLE_AUTH_METHOD in .env:
 *
 *   service_account (default & recommended for automation):
 *     - Download a service account JSON key from Google Cloud Console.
 *     - Save it to ./credentials/service-account.json
 *     - Share your Google Sheet with the service account's email address.
 *     - No interactive browser step needed.
 *
 *   oauth2 (use if you prefer to authenticate as yourself):
 *     - Create OAuth2 Desktop credentials in Google Cloud Console.
 *     - Save the downloaded JSON to ./credentials/oauth2-client.json
 *     - Run `npm run auth` once to complete the browser authorization flow.
 *     - A token.json is saved alongside the credentials file for future runs.
 */

const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Returns an authenticated Google auth client.
 * Call this once and pass the result to GoogleSheetsClient.
 */
async function getGoogleAuth() {
  const method      = (process.env.GOOGLE_AUTH_METHOD ?? 'service_account').toLowerCase();
  const credFile    = path.resolve(__dirname, '..', process.env.GOOGLE_CREDENTIALS_FILE ?? './credentials/service-account.json');

  if (!fs.existsSync(credFile)) {
    throw new Error(
      `Google credentials file not found: ${credFile}\n` +
      'See SETUP.md for instructions on downloading your credentials.'
    );
  }

  if (method === 'service_account') {
    const auth = new google.auth.GoogleAuth({
      keyFile: credFile,
      scopes:  SCOPES,
    });
    return auth.getClient();
  }

  if (method === 'oauth2') {
    return _getOAuth2Client(credFile);
  }

  throw new Error(`Unknown GOOGLE_AUTH_METHOD "${method}". Use "service_account" or "oauth2".`);
}

// ── OAuth2 flow (interactive, run once via `npm run auth`) ────────────────────

async function _getOAuth2Client(credFile) {
  const creds  = JSON.parse(fs.readFileSync(credFile, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed ?? creds.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const tokenFile = path.join(path.dirname(credFile), 'token.json');

  if (fs.existsSync(tokenFile)) {
    client.setCredentials(JSON.parse(fs.readFileSync(tokenFile, 'utf8')));
    return client;
  }

  // No token saved — user needs to run `npm run auth` interactively
  throw new Error(
    'No OAuth2 token found. Run `npm run auth` in your terminal to authorize once.'
  );
}

/**
 * Interactive OAuth2 setup — run via `npm run auth`.
 * Opens a browser URL, user pastes the code back, token is saved to disk.
 */
async function runOAuth2Flow() {
  const credFile = path.resolve(__dirname, '..', process.env.GOOGLE_CREDENTIALS_FILE ?? './credentials/oauth2-client.json');

  if (!fs.existsSync(credFile)) {
    console.error(`ERROR: Credentials file not found: ${credFile}`);
    console.error('Download your OAuth2 Desktop credentials from Google Cloud Console first.');
    process.exit(1);
  }

  const creds  = JSON.parse(fs.readFileSync(credFile, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed ?? creds.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\nOpen this URL in your browser to authorize:\n');
  console.log(authUrl);
  console.log('\nAfter authorizing, paste the code shown here and press Enter:');

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await new Promise((resolve, reject) => {
    rl.question('Code: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await client.getToken(code.trim());
        client.setCredentials(tokens);
        const tokenFile = path.join(path.dirname(credFile), 'token.json');
        fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
        console.log(`\nToken saved to: ${tokenFile}`);
        console.log('You can now run `npm start` or `npm run test-connection`.');
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = { getGoogleAuth, runOAuth2Flow };

// Run the OAuth2 flow when called directly: node src/auth.js
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
  runOAuth2Flow().catch((err) => {
    console.error('Auth failed:', err.message);
    process.exit(1);
  });
}
