const fs = require('fs');
const { google } = require('googleapis');
const config = require('./config');

// Builds an authenticated OAuth2 client from the cached token file produced
// by `npm run authorize`. Throws a clear error if setup hasn't happened yet.
function getAuthedClient() {
  const { credentialsPath, tokenPath, scopes } = config.googleSheets;

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google OAuth client file not found at ${credentialsPath}. ` +
        'Download it from Google Cloud Console (APIs & Services > Credentials) ' +
        'and save it there, or set GOOGLE_OAUTH_CREDENTIALS_PATH.'
    );
  }
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Google OAuth token not found at ${tokenPath}. Run "npm run authorize" once ` +
        'to connect your Google account before starting the workflow.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  client.setCredentials(token);

  return client;
}

module.exports = { getAuthedClient };
