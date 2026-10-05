// ─── Pre-Flight Connection Test ───────────────────────────────────────────────
// Run this BEFORE the first scheduled run to confirm both Apollo and
// Google Sheets are connected and working.
// Usage: node test-connection.js

require('dotenv').config();

const axios  = require('axios');
const { google } = require('googleapis');
const { getGoogleAuth } = require('./workflow');
const config = require('./config');

async function testApollo() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is missing from .env');

  // Lightweight profile call — uses no credits
  const res = await axios.get('https://api.apollo.io/api/v1/users/me', {
    headers: { 'X-Api-Key': key },
    timeout: 10000,
  });

  const user = res.data?.user || {};
  return `Connected as "${user.name || user.email || 'unknown'}" (plan: ${user.plan_tier || 'unknown'})`;
}

async function testGoogleSheets() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is missing from .env');

  const auth   = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Just read the sheet metadata to confirm access
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'properties.title,sheets.properties.title' });
  const sheetName = process.env.SHEET_NAME || 'Sheet1';
  const sheetNames = (res.data.sheets || []).map((s) => s.properties.title);

  if (!sheetNames.includes(sheetName)) {
    throw new Error(
      `Sheet "${sheetName}" not found in spreadsheet "${res.data.properties.title}".\n` +
      `Available tabs: ${sheetNames.join(', ')}\n` +
      `Update SHEET_NAME in .env to match one of these.`
    );
  }

  return `Connected to "${res.data.properties.title}" → tab "${sheetName}"`;
}

async function testHeaders() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName     = process.env.SHEET_NAME || 'Sheet1';

  const auth   = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const headers = (res.data.values || [[]])[0];
  const expected = config.sheetColumns;

  const mismatches = expected.filter((col, i) => headers[i] !== col);
  if (mismatches.length > 0) {
    const headerList = expected.map((col, i) => `  ${String.fromCharCode(65 + i)}: ${col}`).join('\n');
    throw new Error(
      `Sheet header mismatch. Expected:\n${headerList}\n\nFound: ${JSON.stringify(headers)}\n\n` +
      'Make sure row 1 of your sheet has exactly these headers in columns A–I.'
    );
  }

  return `Headers verified: ${expected.join(' | ')}`;
}

(async () => {
  console.log('─── HVAC Lead Gen — Pre-Flight Connection Test ─────────────────────────\n');
  let allPassed = true;

  const tests = [
    { name: 'Apollo.io API',       fn: testApollo },
    { name: 'Google Sheets Auth',  fn: testGoogleSheets },
    { name: 'Sheet Header Check',  fn: testHeaders },
  ];

  for (const test of tests) {
    process.stdout.write(`Testing ${test.name}... `);
    try {
      const result = await test.fn();
      console.log(`✓  ${result}`);
    } catch (err) {
      console.log(`✗  FAILED`);
      console.error(`   → ${err.message}\n`);
      allPassed = false;
    }
  }

  console.log('\n' + '─'.repeat(60));
  if (allPassed) {
    console.log('✓  All checks passed — ready for first scheduled run.');
    console.log('   Start the scheduler with: node index.js');
  } else {
    console.log('✗  One or more checks failed. Fix the issues above before running.');
    process.exit(1);
  }
})();
