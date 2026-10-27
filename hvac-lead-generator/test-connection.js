/**
 * Connection test — run this BEFORE the first scheduled run to confirm that
 * both Apollo.io and Google Sheets are properly configured.
 *
 * Usage:  node test-connection.js
 *
 * What it checks:
 *   1. APOLLO_API_KEY — fires a minimal test search (1 result) and prints the raw response
 *   2. Google Sheets — reads the first row of your spreadsheet to confirm access
 */

require('dotenv').config();

const axios = require('axios');
const { buildSheetsClient } = require('./sheets');

const APOLLO_KEY        = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID    = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME        = process.env.GOOGLE_SHEET_NAME ?? 'Leads';
const KEY_FILE          = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ?? './google-credentials.json';

let passed = 0;
let failed = 0;

function ok(label)  { console.log(`  ✓  ${label}`); passed++; }
function fail(label, reason) { console.log(`  ✗  ${label}\n     ${reason}`); failed++; }

// ── Test 1: Apollo.io ────────────────────────────────────────────────────────

async function testApollo() {
  console.log('\n[1] Testing Apollo.io connection...');

  if (!APOLLO_KEY) {
    fail('APOLLO_API_KEY set', 'Environment variable APOLLO_API_KEY is missing');
    return;
  }
  ok('APOLLO_API_KEY set');

  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: APOLLO_KEY,
        page: 1,
        per_page: 1,
        person_locations: ['Kalamazoo, Michigan, US'],
        person_titles: ['Owner'],
        has_phone: true,
        q_keywords: 'HVAC',
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
    );

    const count = response.data?.people?.length ?? 0;
    ok(`Apollo API responded — sample result count: ${count}`);

    if (count > 0) {
      const p = response.data.people[0];
      console.log(`     Sample: ${p.first_name} ${p.last_name} — ${p.organization?.name ?? 'N/A'} (${p.city ?? ''})`);
    } else {
      console.log('     (No results for test query — API is working but this narrow query returned nothing)');
    }
  } catch (err) {
    const status = err.response?.status;
    const data   = JSON.stringify(err.response?.data ?? {}).slice(0, 200);
    fail('Apollo API call', `HTTP ${status ?? 'network error'} — ${data || err.message}`);
  }
}

// ── Test 2: Google Sheets ────────────────────────────────────────────────────

async function testSheets() {
  console.log('\n[2] Testing Google Sheets connection...');

  if (!SPREADSHEET_ID) {
    fail('GOOGLE_SPREADSHEET_ID set', 'Environment variable GOOGLE_SPREADSHEET_ID is missing');
    return;
  }
  ok('GOOGLE_SPREADSHEET_ID set');

  let sheets;
  try {
    sheets = buildSheetsClient(KEY_FILE);
    ok('Google credentials file loaded');
  } catch (err) {
    fail('Load Google credentials', err.message);
    return;
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:I1`,
    });
    const row = res.data.values?.[0] ?? [];
    ok(`Spreadsheet accessible — row 1: [${row.join(', ') || 'empty'}]`);
  } catch (err) {
    const msg = err.message ?? String(err);
    fail(
      'Read spreadsheet',
      `${msg}\n     Make sure you shared the spreadsheet with the service account email.`
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('=== HVAC Lead Generator — Connection Test ===');

  await testApollo();
  await testSheets();

  console.log(`\n${'─'.repeat(44)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\nAll checks passed! You are ready to run the lead generator.');
    console.log('  node index.js --run-now   → one immediate run');
    console.log('  node index.js             → start 7am daily scheduler');
  } else {
    console.log('\nFix the failing checks above, then re-run: node test-connection.js');
  }

  process.exit(failed > 0 ? 1 : 0);
})();
