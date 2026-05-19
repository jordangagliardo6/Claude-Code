/**
 * Run this BEFORE starting the scheduler to confirm both APIs are reachable
 * and your credentials are correct.
 *
 *   node test-connection.js
 */

require('dotenv').config();

const axios  = require('axios');
const { google } = require('googleapis');

// ── Apollo connection test ────────────────────────────────────────────────────
async function testApollo() {
  console.log('\n─── Apollo.io ───────────────────────────────────────────────');
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    console.error('  ❌  APOLLO_API_KEY is not set in .env');
    return false;
  }

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: key,
        person_titles: ['Owner'],
        person_locations: ['Kalamazoo, Michigan, United States'],
        organization_num_employees_ranges: ['1,25'],
        q_organization_keyword_tags: ['hvac'],
        per_page: 3,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 }
    );

    const total = res.data?.pagination?.total_entries ?? '?';
    const returned = res.data?.people?.length ?? 0;
    console.log(`  ✅  Connected to Apollo.io`);
    console.log(`      Sample query → ${returned} result(s) returned (${total} total available)`);

    if (returned > 0) {
      const p = res.data.people[0];
      const hasPhone = !!(p.sanitized_phone || p.phone_numbers?.length);
      console.log(`      First result : ${p.first_name} ${p.last_name} @ ${p.organization?.name ?? 'unknown'} (phone: ${hasPhone ? 'yes' : 'none — will be filtered'})`);
    }

    return true;
  } catch (err) {
    const detail = err.response?.data?.message ?? err.message;
    console.error(`  ❌  Apollo connection failed: ${detail}`);
    if (err.response?.status === 401) {
      console.error('      → Check that APOLLO_API_KEY is correct and has API access enabled.');
    }
    return false;
  }
}

// ── Google Sheets connection test ─────────────────────────────────────────────
async function testGoogleSheets() {
  console.log('\n─── Google Sheets ───────────────────────────────────────────');
  const credPath     = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!credPath) {
    console.error('  ❌  GOOGLE_APPLICATION_CREDENTIALS is not set in .env');
    return false;
  }
  if (!spreadsheetId) {
    console.error('  ❌  SPREADSHEET_ID is not set in .env');
    return false;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const info   = await sheets.spreadsheets.get({ spreadsheetId });

    const title      = info.data.properties?.title;
    const sheetNames = info.data.sheets?.map((s) => s.properties.title).join(', ');

    console.log(`  ✅  Connected to Google Sheets`);
    console.log(`      Spreadsheet : "${title}"`);
    console.log(`      Tabs        : ${sheetNames}`);

    const targetTab = process.env.SHEET_NAME ?? 'Sheet1';
    const tabExists = info.data.sheets?.some((s) => s.properties.title === targetTab);
    if (!tabExists) {
      console.warn(`  ⚠️   Tab "${targetTab}" not found. Create it, or update SHEET_NAME in .env.`);
      console.warn(`       Available tabs: ${sheetNames}`);
    } else {
      console.log(`      Target tab  : "${targetTab}" ✅`);
    }

    return true;
  } catch (err) {
    console.error(`  ❌  Google Sheets connection failed: ${err.message}`);
    if (err.message.includes('ENOENT')) {
      console.error(`      → credentials.json not found at: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    } else if (err.code === 403) {
      console.error('      → The service account does not have access to this spreadsheet.');
      console.error('        Share the sheet with the service account email (client_email in credentials.json).');
    } else if (err.code === 404) {
      console.error('      → Spreadsheet not found. Double-check SPREADSHEET_ID in .env.');
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        HVAC Lead Gen — Connection Test                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const apolloOk = await testApollo();
  const sheetsOk = await testGoogleSheets();

  console.log('\n─── Summary ─────────────────────────────────────────────────');
  console.log(`  Apollo.io     : ${apolloOk ? '✅ Ready' : '❌ Fix required'}`);
  console.log(`  Google Sheets : ${sheetsOk ? '✅ Ready' : '❌ Fix required'}`);

  if (apolloOk && sheetsOk) {
    console.log('\n  ✅  Both systems connected. You\'re ready to run the workflow.');
    console.log('      Trigger a manual run now : npm run run:now');
    console.log('      Start the daily scheduler : npm start\n');
    process.exit(0);
  } else {
    console.log('\n  ❌  Resolve the issues above before starting the scheduler.\n');
    process.exit(1);
  }
})();
