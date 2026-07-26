'use strict';
// Run before your first scheduled run to verify both Apollo and Google Sheets are working.
// Usage: node test-connection.js
require('dotenv').config();

const axios = require('axios');
const { createSheetsClient, ensureHeaders, appendLeads } = require('./src/sheets');

const PASS = '\x1b[32m✓ PASS\x1b[0m';
const FAIL = '\x1b[31m✗ FAIL\x1b[0m';

async function testApollo() {
  console.log('\n── Apollo.io ────────────────────────────────────');
  if (!process.env.APOLLO_API_KEY) {
    console.log(`${FAIL} APOLLO_API_KEY is not set in .env`);
    return false;
  }
  try {
    const resp = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'X-Api-Key': process.env.APOLLO_API_KEY },
      timeout: 10000,
    });
    const ok = resp.status === 200;
    console.log(`${ok ? PASS : FAIL} Apollo API key is ${ok ? 'valid' : 'INVALID'}`);
    return ok;
  } catch (err) {
    // Apollo may not have a /health endpoint — fall back to a minimal people search
    try {
      const resp2 = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        { per_page: 1, page: 1 },
        { headers: { 'X-Api-Key': process.env.APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      const ok = resp2.status === 200;
      console.log(`${ok ? PASS : FAIL} Apollo API reachable, key is ${ok ? 'valid' : 'INVALID'}`);
      return ok;
    } catch (err2) {
      const msg = err2.response?.data?.message || err2.message;
      console.log(`${FAIL} Apollo API error: ${msg}`);
      return false;
    }
  }
}

async function testGoogleSheets() {
  console.log('\n── Google Sheets ────────────────────────────────');
  if (!process.env.GOOGLE_SHEETS_ID) {
    console.log(`${FAIL} GOOGLE_SHEETS_ID is not set in .env`);
    return false;
  }
  try {
    const sheets = createSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    // Test read — get spreadsheet metadata
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    console.log(`${PASS} Connected to spreadsheet: "${meta.data.properties.title}"`);

    // Ensure headers exist
    await ensureHeaders(sheets, spreadsheetId);
    console.log(`${PASS} Column headers verified`);

    // Test write — append a clearly-marked test row, then immediately delete it
    const testLead = {
      businessName: '__TEST_ROW_DELETE_ME__',
      firstName: 'Test',
      lastName: 'Row',
      phone: '555-000-0000',
      city: 'Kalamazoo',
      website: '',
    };
    const appended = await appendLeads(sheets, spreadsheetId, [testLead]);
    console.log(`${PASS} Test row written (${appended} row)`);

    // Find and delete the test row
    const allValues = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Leads!B:B',
    });
    const rows = allValues.data.values || [];
    const testRowIndex = rows.findIndex(r => r[0] === '__TEST_ROW_DELETE_ME__');
    if (testRowIndex >= 0) {
      // Get the sheet ID for batch update (needed for deleteDimension)
      const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
      const leadsSheet = sheetMeta.data.sheets.find(
        s => s.properties.title === 'Leads'
      );
      if (leadsSheet) {
        const sheetId = leadsSheet.properties.sheetId;
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: testRowIndex,     // 0-indexed
                  endIndex: testRowIndex + 1,
                },
              },
            }],
          },
        });
        console.log(`${PASS} Test row cleaned up`);
      }
    }

    return true;
  } catch (err) {
    const detail = err.message || String(err);
    console.log(`${FAIL} Google Sheets error: ${detail}`);
    if (detail.includes('invalid_grant') || detail.includes('Token')) {
      console.log('      → Your OAuth token may have expired. Re-run the Google auth setup.');
    }
    if (detail.includes('403')) {
      console.log('      → Make sure your service account or Google account has Editor access to the sheet.');
    }
    return false;
  }
}

async function main() {
  console.log('=== Apollo Lead Gen — Connection Test ===');

  const apolloOk = await testApollo();
  const sheetsOk = await testGoogleSheets();

  console.log('\n─────────────────────────────────────────');
  if (apolloOk && sheetsOk) {
    console.log('\x1b[32mAll checks passed. Safe to start the scheduler.\x1b[0m');
    console.log('Run "npm start" to launch on the daily 7am schedule.');
    console.log('Run "npm run run-now" to trigger an immediate test pull.\n');
    process.exit(0);
  } else {
    console.log('\x1b[31mOne or more checks failed. Fix the errors above before starting.\x1b[0m\n');
    process.exit(1);
  }
}

main();
