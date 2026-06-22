// One-time setup script: run `npm run authorize` to grant this app access
// to your Google Sheet via OAuth. Generates token.json, which the rest of
// the workflow then reuses on every run without prompting again.
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const config = require('./config');

async function main() {
  const { credentialsPath, tokenPath, scopes } = config.googleSheets;

  if (!fs.existsSync(credentialsPath)) {
    console.error(
      `Could not find ${credentialsPath}. Download your OAuth client ID JSON ` +
        'from Google Cloud Console and save it at that path first.'
    );
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });

  console.log('1. Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. Approve access, then copy the authorization code shown.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('3. Paste the authorization code here: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await client.getToken(code.trim());
      fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
      console.log(`\nSaved credentials to ${tokenPath}. You're connected to Google Sheets.`);
    } catch (err) {
      console.error('Failed to exchange authorization code for tokens:', err.message);
      process.exit(1);
    }
  });
}

main();
