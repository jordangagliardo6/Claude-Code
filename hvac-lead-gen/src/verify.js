/**
 * verify.js — First-run connection check.
 *
 * Run with: npm run verify
 *
 * Tests both Apollo.io and Google Sheets connectivity and prints a clear
 * pass/fail report before you let the scheduler run unsupervised.
 */

require('dotenv').config();

const axios   = require('axios');
const { google } = require('googleapis');
const path    = require('path');
const config  = require('./config');

const PASS = '✓';
const FAIL = '✗';

async function verify() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Verification');
  console.log('══════════════════════════════════════════════\n');

  let allGood = true;

  // ── Check 1: Env vars ─────────────────────────────────────────────────────
  console.log('[ Env Vars ]');
  const envChecks = {
    APOLLO_API_KEY:        !!process.env.APOLLO_API_KEY,
    GOOGLE_SPREADSHEET_ID: !!process.env.GOOGLE_SPREADSHEET_ID,
    GOOGLE_CREDENTIALS_PATH: !!process.env.GOOGLE_CREDENTIALS_PATH,
  };
  for (const [key, ok] of Object.entries(envChecks)) {
    console.log(`  ${ok ? PASS : FAIL}  ${key}`);
    if (!ok) allGood = false;
  }

  // ── Check 2: Apollo.io API ────────────────────────────────────────────────
  console.log('\n[ Apollo.io ]');
  try {
    const res = await axios.post(
      `${config.apollo.baseUrl}/mixed_people/search`,
      {
        person_titles: ['Owner'],
        organization_locations: ['Michigan, United States'],
        organization_num_employees_ranges: ['1,10'],
        per_page: 1,
        page: 1,
      },
      {
        headers: {
          'X-Api-Key': config.apollo.apiKey,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 15000,
      }
    );

    const total = res.data?.pagination?.total_entries ?? '?';
    console.log(`  ${PASS}  Connected — API key valid`);
    console.log(`  ${PASS}  Test search returned (total available: ${total})`);
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    console.log(`  ${FAIL}  Apollo connection failed (HTTP ${status || 'N/A'}): ${detail}`);
    allGood = false;
  }

  // ── Check 3: Google Sheets ────────────────────────────────────────────────
  console.log('\n[ Google Sheets ]');
  try {
    const credPath = path.isAbsolute(config.google.credentialsPath)
      ? config.google.credentialsPath
      : path.resolve(__dirname, '..', config.google.credentialsPath.replace(/^\.\//, ''));

    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const res = await sheets.spreadsheets.get({
      spreadsheetId: config.google.spreadsheetId,
    });

    console.log(`  ${PASS}  Credentials valid`);
    console.log(`  ${PASS}  Spreadsheet found: "${res.data.properties.title}"`);

    const sheetNames = res.data.sheets.map((s) => s.properties.title);
    const sheetExists = sheetNames.includes(config.google.sheetName);
    console.log(
      `  ${sheetExists ? PASS : FAIL}  Sheet tab "${config.google.sheetName}" ${sheetExists ? 'found' : 'NOT FOUND — tabs available: ' + sheetNames.join(', ')}`
    );
    if (!sheetExists) allGood = false;
  } catch (err) {
    console.log(`  ${FAIL}  Google Sheets connection failed: ${err.message}`);
    allGood = false;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  if (allGood) {
    console.log('  ALL CHECKS PASSED — safe to run: npm start');
  } else {
    console.log('  SOME CHECKS FAILED — fix the issues above before starting.');
  }
  console.log('══════════════════════════════════════════════\n');

  process.exit(allGood ? 0 : 1);
}

verify().catch((err) => {
  console.error('Verification crashed:', err.message);
  process.exit(1);
});
