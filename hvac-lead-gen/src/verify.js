/**
 * verify.js — First-run connectivity check
 *
 * Run this BEFORE starting the scheduler to confirm both Apollo.io and
 * Google Sheets are properly configured and accessible.
 *
 * Usage:
 *   node src/verify.js
 *   npm run verify
 *
 * What it checks:
 *   1. APOLLO_API_KEY is set and can reach the Apollo API
 *   2. Apollo returns results for HVAC Southwest Michigan
 *   3. credentials.json exists and is valid
 *   4. Google OAuth2 token is present (or guides you through authorization)
 *   5. SPREADSHEET_ID is set and the sheet is accessible
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const { getAuthClient } = require('./sheets');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'credentials.json');

// ── ANSI colors for terminal output ──────────────────────────────────────
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

async function verifyApollo() {
  console.log('\n' + bold('Step 1: Apollo.io'));

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    console.log(`  ${red('✗')} APOLLO_API_KEY is not set in .env`);
    console.log(`    Get your key at: https://app.apollo.io/#/settings/integrations/api`);
    return false;
  }

  try {
    const res = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        person_titles: ['Owner'],
        organization_locations: ['Michigan, United States'],
        organization_sic_codes: ['1711'],
        per_page: 1,
        page: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'Cache-Control': 'no-cache',
        },
        timeout: 15000,
      }
    );

    const total = res.data.pagination?.total_entries ?? 0;
    const plan = res.data.breadcrumbs?.find((b) => b.label === 'Plan')?.display_name || '';

    console.log(`  ${green('✓')} Apollo connected!`);
    console.log(`    Total matching contacts in database: ${total.toLocaleString()}`);
    if (plan) console.log(`    Account plan: ${plan}`);

    if (process.env.REVEAL_PHONE_NUMBERS === 'true') {
      console.log(
        `    ${yellow('!')} REVEAL_PHONE_NUMBERS=true — each enrichment uses 1 Apollo export credit`
      );
    }

    return true;
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    console.log(`  ${red('✗')} Apollo connection failed: ${detail}`);

    if (err.response?.status === 401) {
      console.log('    Double-check your APOLLO_API_KEY in .env');
    }
    return false;
  }
}

async function verifyGoogleSheets() {
  console.log('\n' + bold('Step 2: Google Sheets'));

  // Check credentials.json
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log(`  ${red('✗')} credentials/credentials.json not found`);
    console.log('');
    console.log('  To create it:');
    console.log('    1. Go to https://console.cloud.google.com/');
    console.log('    2. Create or select a project');
    console.log('    3. Enable the Google Sheets API');
    console.log('       APIs & Services → Library → search "Google Sheets API" → Enable');
    console.log('    4. Create OAuth 2.0 credentials:');
    console.log('       APIs & Services → Credentials → Create Credentials → OAuth client ID');
    console.log('       Application type: Desktop app → Download JSON');
    console.log(`    5. Save the downloaded file as: ${CREDENTIALS_PATH}`);
    return false;
  }

  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const section = creds.installed || creds.web;
    if (!section?.client_id || !section?.client_secret) {
      throw new Error('Missing client_id or client_secret');
    }
    console.log(`  ${green('✓')} credentials.json looks valid (client_id: ...${section.client_id.slice(-8)})`);
  } catch (err) {
    console.log(`  ${red('✗')} credentials.json is invalid: ${err.message}`);
    return false;
  }

  // Check/create OAuth token
  let auth;
  try {
    auth = await getAuthClient(); // will prompt interactively if token doesn't exist
    console.log(`  ${green('✓')} OAuth2 token obtained`);
  } catch (err) {
    console.log(`  ${red('✗')} OAuth2 authorization failed: ${err.message}`);
    return false;
  }

  // Verify spreadsheet access
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId || spreadsheetId === 'your_spreadsheet_id_here') {
    console.log(`  ${red('✗')} SPREADSHEET_ID is not set in .env`);
    console.log('    Find it in your sheet URL: .../spreadsheets/d/SPREADSHEET_ID/edit');
    return false;
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    const title = res.data.properties?.title || '(unknown)';
    const sheetNames = res.data.sheets?.map((s) => s.properties?.title).join(', ');
    console.log(`  ${green('✓')} Spreadsheet connected: "${title}"`);
    console.log(`    Tabs: ${sheetNames}`);

    const targetSheet = process.env.SHEET_NAME || 'Sheet1';
    const sheetExists = res.data.sheets?.some((s) => s.properties?.title === targetSheet);
    if (!sheetExists) {
      console.log(
        `    ${yellow('!')} Tab "${targetSheet}" not found — will use first available tab or update SHEET_NAME in .env`
      );
    }

    return true;
  } catch (err) {
    console.log(`  ${red('✗')} Could not access spreadsheet: ${err.message}`);
    if (err.message.includes('404')) {
      console.log('    Make sure the SPREADSHEET_ID in .env is correct');
    } else if (err.message.includes('403')) {
      console.log('    Make sure the Google account you authorized has access to this spreadsheet');
    }
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log('');
  console.log(bold('═══════════════════════════════════════════════════'));
  console.log(bold('  HVAC Lead Generator — Pre-Flight Verification    '));
  console.log(bold('═══════════════════════════════════════════════════'));

  const apolloOk = await verifyApollo();
  const sheetsOk = await verifyGoogleSheets();

  console.log('\n' + bold('─── Results ───────────────────────────────────────'));
  console.log(`  Apollo.io     : ${apolloOk ? green('CONNECTED') : red('FAILED')}`);
  console.log(`  Google Sheets : ${sheetsOk ? green('CONNECTED') : red('FAILED')}`);
  console.log('');

  if (apolloOk && sheetsOk) {
    console.log(green('  All systems go!'));
    console.log('');
    console.log('  Start the daily scheduler:');
    console.log('    node src/index.js');
    console.log('');
    console.log('  Or trigger one run right now:');
    console.log('    node src/run-now.js');
    console.log('');
  } else {
    console.log(red('  Fix the issues above, then re-run: node src/verify.js'));
    console.log('');
    process.exit(1);
  }
})();
