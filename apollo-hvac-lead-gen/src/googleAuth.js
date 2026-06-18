// Loads a Google OAuth2 client using credentials.json (downloaded from Google
// Cloud Console) and token.json (created once by `npm run auth`).

const fs = require('fs');
const { google } = require('googleapis');
const config = require('../config');

function loadOauthClient() {
  if (!fs.existsSync(config.googleOauthCredentialsPath)) {
    throw new Error(
      `Missing ${config.googleOauthCredentialsPath}. Download an OAuth client (Desktop app) ` +
        'from Google Cloud Console and save it there, then run "npm run auth".'
    );
  }
  if (!fs.existsSync(config.googleOauthTokenPath)) {
    throw new Error(
      `Missing ${config.googleOauthTokenPath}. Run "npm run auth" once to connect your Google account.`
    );
  }

  const { client_id, client_secret, redirect_uris } = JSON.parse(
    fs.readFileSync(config.googleOauthCredentialsPath, 'utf8')
  ).installed;
  const token = JSON.parse(fs.readFileSync(config.googleOauthTokenPath, 'utf8'));

  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials(token);

  // Persist refreshed access tokens so we don't have to re-auth every run.
  client.on('tokens', (newTokens) => {
    const merged = { ...token, ...newTokens };
    fs.writeFileSync(config.googleOauthTokenPath, JSON.stringify(merged, null, 2));
  });

  return client;
}

module.exports = { loadOauthClient };
