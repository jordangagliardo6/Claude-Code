/**
 * Run this before the first scheduled run to confirm both APIs are connected:
 *   node verify.js
 */
require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');

async function verifyApollo() {
  const key = process.env.APOLLO_API_KEY;
  if (!key || key === 'your_apollo_api_key_here') {
    console.error('  ❌ APOLLO_API_KEY not set in .env');
    return false;
  }
  try {
    // Use the users/me endpoint — works on all plans and costs no credits
    const res = await axios.get('https://api.apollo.io/api/v1/users/me', {
      headers: { 'x-api-key': key },
    });
    const user = res.data?.user;
    console.log(`  ✅ Apollo connected. Account: ${user?.email || 'unknown'}`);

    // Check if the people search endpoint is accessible (paid plan required)
    try {
      await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/api_search',
        { per_page: 1, q_keywords: 'test' },
        { headers: { 'x-api-key': key, 'Content-Type': 'application/json' } }
      );
      console.log('  ✅ Apollo people search API: accessible (paid plan confirmed)');
    } catch (err) {
      if (err.response?.data?.error_code === 'API_INACCESSIBLE') {
        console.warn(
          '  ⚠️  Apollo people search API: NOT accessible on your current plan.\n' +
          '     Upgrade to Basic ($49/mo) at https://www.apollo.io/pricing to enable automated lead pull.'
        );
      } else {
        console.warn('  ⚠️  Apollo people search returned unexpected error:', err.response?.data?.error || err.message);
      }
    }
    return true;
  } catch (err) {
    console.error('  ❌ Apollo connection failed:', err.response?.data?.message || err.message);
    return false;
  }
}

async function verifySheets() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

  if (!sheetId) {
    console.error('  ❌ GOOGLE_SHEET_ID not set in .env');
    return false;
  }
  if (!credPath || !fs.existsSync(credPath)) {
    console.error(`  ❌ Google credentials file not found at: ${credPath}`);
    console.error('     Download your service account JSON from Google Cloud Console and set the path in .env');
    return false;
  }

  try {
    const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    console.log(`  ✅ Google Sheets connected. Sheet: "${res.data.properties?.title}"`);
    console.log(`     URL: https://docs.google.com/spreadsheets/d/${sheetId}`);
    return true;
  } catch (err) {
    console.error('  ❌ Google Sheets connection failed:', err.message);
    if (err.message.includes('403')) {
      console.error(
        '     The service account does not have access to this sheet.\n' +
        '     Share the spreadsheet with your service account email (found in google-credentials.json as "client_email").'
      );
    }
    return false;
  }
}

async function main() {
  console.log('\n=== HVAC Lead Gen — Connection Verification ===\n');

  console.log('Apollo.io:');
  const apolloOk = await verifyApollo();

  console.log('\nGoogle Sheets:');
  const sheetsOk = await verifySheets();

  console.log('\n--- Summary ---');
  if (apolloOk && sheetsOk) {
    console.log('✅ Both connections verified. Run "npm run run-now" for an immediate test run.');
    console.log('   Or "npm start" to start the scheduler (runs daily at 7:00 AM ET).\n');
  } else {
    console.log('❌ Fix the issues above before running the workflow.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Verification script error:', err.message);
  process.exit(1);
});
