/**
 * setup-test.js — First-run connectivity verification
 *
 * Run this BEFORE starting the scheduler to confirm both
 * Apollo.io and Google Sheets are connected and configured correctly.
 *
 * Usage:
 *   npm run test-setup
 *   node setup-test.js
 */

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');

// ── Apollo Test ────────────────────────────────────────────────────────────

async function testApollo() {
  console.log('\n┌─ Testing Apollo.io ─────────────────────────────────┐');

  if (!process.env.APOLLO_API_KEY) {
    console.log('│ ❌ APOLLO_API_KEY is not set in .env');
    console.log('└─────────────────────────────────────────────────────┘');
    return false;
  }

  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        person_titles: ['Owner'],
        organization_locations: ['Michigan, United States'],
        q_organization_keyword_tags: ['hvac'],
        organization_num_employees_ranges: ['1,10', '11,25'],
        per_page: 3,
        page: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY,
          'Cache-Control': 'no-cache',
        },
        timeout: 20000,
      }
    );

    const total = response.data.pagination?.total_entries || 0;
    const sample = response.data.people || [];

    console.log(`│ ✅ Connected successfully`);
    console.log(`│    Total matching contacts in Apollo DB: ~${total}`);
    console.log(`│    Sample contacts returned: ${sample.length}`);

    if (sample.length > 0) {
      const p = sample[0];
      const company = p.organization_name || p.organization?.name || 'unknown';
      const hasPhone = (p.phone_numbers || []).length > 0 || p.sanitized_phone;
      console.log(`│    First result: ${p.first_name} at ${company} — phone: ${hasPhone ? '✅ present' : '⚠ not in search result (may need enrichment)'}`);
    }

    console.log('└─────────────────────────────────────────────────────┘');
    return true;
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.log(`│ ❌ Connection failed: ${detail}`);

    if (err.response?.status === 401) {
      console.log('│    → APOLLO_API_KEY is invalid or expired.');
    } else if (err.response?.status === 429) {
      console.log('│    → Rate limit hit. Wait a few minutes and try again.');
    }

    console.log('└─────────────────────────────────────────────────────┘');
    return false;
  }
}

// ── Google Sheets Test ─────────────────────────────────────────────────────

async function testGoogleSheets() {
  console.log('\n┌─ Testing Google Sheets ─────────────────────────────┐');

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, 'credentials.json');
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  if (!spreadsheetId) {
    console.log('│ ❌ GOOGLE_SPREADSHEET_ID is not set in .env');
    console.log('└─────────────────────────────────────────────────────┘');
    return false;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title,sheets.properties.title',
    });

    const title = response.data.properties?.title || 'Unknown';
    const tabs = (response.data.sheets || []).map(s => s.properties.title);

    console.log(`│ ✅ Connected to spreadsheet: "${title}"`);
    console.log(`│    Tabs found: ${tabs.join(', ')}`);

    if (!tabs.includes(sheetName)) {
      console.log(`│ ⚠  Tab "${sheetName}" not found — it will be created on first run.`);
      console.log(`│    (Or update GOOGLE_SHEET_NAME in .env to match an existing tab.)`);
    } else {
      // Check header row
      const headerResp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:I1`,
      });
      const header = headerResp.data.values?.[0];
      if (header) {
        console.log(`│    Existing headers: ${header.join(' | ')}`);
      } else {
        console.log(`│    Sheet is empty — headers will be written on first run.`);
      }

      // Count existing rows
      const dataResp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!B:B`,
      });
      const rowCount = Math.max(0, (dataResp.data.values?.length || 1) - 1);
      console.log(`│    Current lead count: ${rowCount} rows`);
    }

    console.log('└─────────────────────────────────────────────────────┘');
    return true;
  } catch (err) {
    console.log(`│ ❌ Connection failed: ${err.message}`);

    if (err.message.includes('ENOENT')) {
      console.log(`│    → credentials.json not found at: ${credPath}`);
      console.log('│    → Follow the Google setup steps in README.md.');
    } else if (err.message.includes('403') || err.message.includes('permission')) {
      console.log('│    → Service account lacks access to the spreadsheet.');
      console.log('│    → Share the sheet with the service account email (Editor role).');
    } else if (err.message.includes('404')) {
      console.log('│    → Spreadsheet not found. Check GOOGLE_SPREADSHEET_ID in .env.');
    }

    console.log('└─────────────────────────────────────────────────────┘');
    return false;
  }
}

// ── Summary ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Setup & Connectivity Test');
  console.log('═══════════════════════════════════════════════════');

  const apolloOk = await testApollo();
  const sheetsOk = await testGoogleSheets();

  console.log('\n┌─ Summary ───────────────────────────────────────────┐');
  console.log(`│  Apollo.io:     ${apolloOk ? '✅ Connected' : '❌ Failed   ← fix before running'}`);
  console.log(`│  Google Sheets: ${sheetsOk ? '✅ Connected' : '❌ Failed   ← fix before running'}`);
  console.log('└─────────────────────────────────────────────────────┘');

  if (apolloOk && sheetsOk) {
    console.log('\n✅ All systems go! You can now run the workflow:\n');
    console.log('  node index.js --run-now   → Run once immediately');
    console.log('  node index.js             → Start daily 7am scheduler\n');
  } else {
    console.log('\n❌ Fix the errors above before starting the workflow.\n');
    console.log('   See README.md for detailed setup instructions.\n');
    process.exit(1);
  }
}

main();
