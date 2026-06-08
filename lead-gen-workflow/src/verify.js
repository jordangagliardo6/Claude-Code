/**
 * verify.js
 * First-run connection check. Run this BEFORE the first scheduled run:
 *
 *   node src/verify.js
 *
 * It confirms:
 *   1. APOLLO_API_KEY is set and responds to a lightweight request.
 *   2. Google credentials file exists and can authenticate.
 *   3. The target spreadsheet is reachable and the service account has write access.
 *
 * On success: prints a green summary and exits 0.
 * On failure: prints a red summary with fix instructions and exits 1.
 */

require('dotenv').config();

const axios    = require('axios');
const path     = require('path');
const { google } = require('googleapis');

const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';

function ok(msg)   { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}!${RESET} ${msg}`); }

async function checkApollo() {
  console.log(`\n${BOLD}1. Apollo.io API${RESET}`);

  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    fail('APOLLO_API_KEY is not set in your .env file.');
    return false;
  }

  try {
    // Lightweight call: fetch the user's own Apollo account profile.
    const res = await axios.get('https://api.apollo.io/api/v1/users/api_profile', {
      headers: { 'X-Api-Key': key, 'Cache-Control': 'no-cache' },
      timeout: 15_000,
    });

    const user = res.data?.user || {};
    ok(`Connected as: ${user.name || user.email || '(account details hidden)'}`);

    const credits = res.data?.user?.credits_used_this_month;
    if (credits !== undefined) {
      ok(`Credits used this month: ${credits}`);
    }
    return true;
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) {
      fail('Apollo returned 401 Unauthorized. Double-check your APOLLO_API_KEY.');
    } else {
      fail(`Apollo request failed: ${err.message}`);
    }
    return false;
  }
}

async function checkGoogleSheets() {
  console.log(`\n${BOLD}2. Google Sheets API${RESET}`);

  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json'
  );
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // Check credentials file exists.
  const fs = require('fs');
  if (!fs.existsSync(credPath)) {
    fail(`Credentials file not found at: ${credPath}`);
    fail('Follow README.md → "Google Setup" to generate and place the file.');
    return false;
  }
  ok(`Credentials file found: ${credPath}`);

  if (!spreadsheetId) {
    fail('GOOGLE_SPREADSHEET_ID is not set in your .env file.');
    return false;
  }

  // Try to authenticate.
  let auth;
  try {
    auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    await auth.getAccessToken();
    ok('Google authentication successful.');
  } catch (err) {
    fail(`Google auth failed: ${err.message}`);
    fail('Verify the credentials JSON is valid and the service account has not been disabled.');
    return false;
  }

  // Try to read spreadsheet metadata.
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    ok(`Spreadsheet found: "${meta.data.properties?.title}"`);

    const tabNames = (meta.data.sheets || []).map((s) => s.properties?.title);
    const SHEET_TAB = process.env.SHEET_TAB_NAME || 'Leads';
    if (tabNames.includes(SHEET_TAB)) {
      ok(`Sheet tab "${SHEET_TAB}" exists.`);
    } else {
      warn(`Sheet tab "${SHEET_TAB}" was not found. Tabs present: ${tabNames.join(', ')}`);
      warn(`Either rename a tab to "${SHEET_TAB}", or update SHEET_TAB_NAME in config.js.`);
    }

    // Write + delete a test row to confirm write access.
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [['__verify_test__']] },
    });
    ok('Write access confirmed (test row appended).');

    // Clean up the test row.
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_TAB}!A:A`,
    });
    const rows = readRes.data.values || [];
    const testRowIndex = rows.findIndex((r) => r[0] === '__verify_test__');
    if (testRowIndex >= 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: meta.data.sheets?.find((s) => s.properties?.title === SHEET_TAB)?.properties?.sheetId || 0,
                dimension: 'ROWS',
                startIndex: testRowIndex,
                endIndex: testRowIndex + 1,
              },
            },
          }],
        },
      });
      ok('Test row removed — sheet is clean.');
    }

    return true;
  } catch (err) {
    if (err.code === 403) {
      fail('Permission denied (403). Share the spreadsheet with your service account email.');
      fail('The service account email is in the credentials JSON under "client_email".');
    } else if (err.code === 404) {
      fail('Spreadsheet not found (404). Double-check GOOGLE_SPREADSHEET_ID in .env.');
    } else {
      fail(`Sheets API error: ${err.message}`);
    }
    return false;
  }
}

async function main() {
  console.log(`\n${BOLD}Lead Gen Workflow — Connection Verification${RESET}`);
  console.log('─'.repeat(48));

  const apolloOk = await checkApollo();
  const sheetsOk = await checkGoogleSheets();

  console.log('\n' + '─'.repeat(48));

  if (apolloOk && sheetsOk) {
    console.log(`\n${GREEN}${BOLD}All checks passed.${RESET} You're ready to run:`);
    console.log('  node src/index.js --run-now   (run once immediately)');
    console.log('  node src/index.js             (start the 7am daily scheduler)\n');
    process.exit(0);
  } else {
    console.log(`\n${RED}${BOLD}One or more checks failed.${RESET} Fix the issues above and re-run:\n  node src/verify.js\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error during verification:', err);
  process.exit(1);
});
