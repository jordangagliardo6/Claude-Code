// ============================================================
// Google OAuth2 Client Setup
// Reads credentials from environment variables.
// Run `npm run setup` once to generate GOOGLE_REFRESH_TOKEN.
// ============================================================

require('dotenv').config();
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getOAuthClient() {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file.\n' +
      'Run `npm run setup` for step-by-step instructions.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'   // out-of-band redirect for desktop apps
  );

  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }

  return oauth2Client;
}

// Returns an auth URL the user must visit once to grant access.
function getAuthUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',  // forces refresh_token to be returned
  });
}

// Exchanges a one-time code (from the auth URL) for tokens.
async function exchangeCode(oauth2Client, code) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

module.exports = { getOAuthClient, getAuthUrl, exchangeCode, SCOPES };
