/**
 * Connection test script — run this BEFORE your first scheduled run.
 *
 * Usage:
 *   node scripts/test-connection.js
 *
 * What it checks:
 *   1. Apollo API key is set and reachable (makes a minimal test call)
 *   2. Google service account credentials are readable
 *   3. Google Sheets can be read and written (appends a test row, then deletes it)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

async function check(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    await fn();
    console.log('✓ PASS');
    passed++;
  } catch (err) {
    console.log(`✗ FAIL\n    ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('\n=== HVAC Lead Workflow — Connection Test ===\n');

  // ── 1. Environment variables ───────────────────────────────────────────────
  await check('APOLLO_API_KEY is set', () => {
    if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is empty or missing from .env');
  });

  await check('GOOGLE_SHEET_ID is set', () => {
    if (!process.env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is empty or missing from .env');
  });

  await check('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is set and file exists', () => {
    const p = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (!p) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is missing from .env');
    const full = path.resolve(p);
    if (!fs.existsSync(full)) throw new Error(`File not found: ${full}`);
    JSON.parse(fs.readFileSync(full, 'utf8')); // throws if malformed JSON
  });

  // ── 2. Apollo reachability ────────────────────────────────────────────────
  await check('Apollo API responds to a ping (account info)', async () => {
    const resp = await axios.get('https://api.apollo.io/v1/auth/health', {
      params: { api_key: process.env.APOLLO_API_KEY },
      timeout: 10000,
    });
    if (resp.status !== 200) throw new Error(`Unexpected status ${resp.status}`);
  });

  // ── 3. Google Sheets read ─────────────────────────────────────────────────
  let sheets;
  await check('Google Sheets API — authenticate', async () => {
    const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
    const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });
  });

  await check('Google Sheets API — read spreadsheet metadata', async () => {
    if (!sheets) throw new Error('Sheets client not initialized (auth failed)');
    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      fields: 'spreadsheetId,properties.title',
    });
    console.log(`\n    → Connected to: "${res.data.properties.title}"`);
  });

  const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

  await check(`Google Sheets API — write a test row to "${tab}"`, async () => {
    if (!sheets) throw new Error('Sheets client not initialized');
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${tab}!A:I`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [['__TEST_ROW__', '__DELETE_ME__', '', '', '', '', '', '', '']],
      },
    });
  });

  await check(`Google Sheets API — delete the test row`, async () => {
    if (!sheets) throw new Error('Sheets client not initialized');
    // Find the row we just wrote and clear it
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${tab}!A:A`,
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === '__TEST_ROW__');
    if (rowIndex === -1) throw new Error('Test row not found after write');
    const rowNumber = rowIndex + 1; // 1-based
    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${tab}!A${rowNumber}:I${rowNumber}`,
    });
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(45)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\n✓ All checks passed! Your workflow is ready to run.\n');
    console.log('  Start the scheduler:  node index.js');
    console.log('  Run once right now:   node -e "require(\'./src/run\').runWorkflow()"');
  } else {
    console.log('\n✗ Fix the failing checks above before running the workflow.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnexpected error during test:', err.message);
  process.exit(1);
});
