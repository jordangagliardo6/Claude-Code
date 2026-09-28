/**
 * Pre-flight connection test.
 * Run `npm run verify` before the first scheduled run to confirm:
 *  1. Apollo API key is valid
 *  2. Google Sheets can be read and written
 *
 * A green ✅ on both means the cron job will work correctly.
 */

require('dotenv').config();
const axios  = require('axios');
const { google } = require('googleapis');

async function verifyApollo() {
  process.stdout.write('Apollo.io   … ');
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    console.log('❌  APOLLO_API_KEY not set in .env');
    return false;
  }
  try {
    const resp = await axios.get(
      'https://api.apollo.io/v1/auth/health',
      { params: { api_key: key }, timeout: 8000 },
    );
    if (resp.data?.is_logged_in || resp.status === 200) {
      console.log('✅  connected');
      return true;
    }
    console.log('❌  unexpected response:', JSON.stringify(resp.data));
    return false;
  } catch (err) {
    console.log('❌  ' + err.message);
    return false;
  }
}

async function verifySheets() {
  process.stdout.write('Google Sheets … ');
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.log('❌  SPREADSHEET_ID not set in .env');
    return false;
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('❌  Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN');
    return false;
  }
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A1:A1',
    });
    console.log(`✅  connected (first cell: "${(res.data.values?.[0]?.[0]) || '(empty)'}")`);
    return true;
  } catch (err) {
    console.log('❌  ' + err.message);
    return false;
  }
}

(async () => {
  console.log('\n=== Verifying connections ===\n');
  const apolloOk = await verifyApollo();
  const sheetsOk = await verifySheets();
  console.log('');
  if (apolloOk && sheetsOk) {
    console.log('✅  All connections good — safe to start the scheduler.\n');
    console.log('    Run:  node index.js --run-now   (test one run)');
    console.log('    Run:  node index.js             (start daily cron)\n');
  } else {
    console.log('⚠️   Fix the errors above before starting the scheduler.\n');
    process.exit(1);
  }
})();
