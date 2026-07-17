'use strict';

// ─── First-Run Setup Verification ────────────────────────────
// Run this BEFORE starting the scheduler to confirm that both
// Apollo.io and Google Sheets are connected correctly.
//
// Usage:  npm run setup
//         (or: node setup-check.js)

require('dotenv').config();
const axios = require('axios');
const { getAuthClient } = require('./auth');
const { google } = require('googleapis');
const config = require('./config');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function ok(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET}  ${msg}`); }
function section(title) {
  console.log(`\n${BOLD}${title}${RESET}`);
  console.log('─'.repeat(50));
}

async function main() {
  console.log(`\n${BOLD}═══ HVAC Lead Gen — Setup Check ════════════════${RESET}`);
  let allGood = true;

  // ── 1. Environment Variables ──────────────────────────────
  section('1 / 4  Environment Variables');

  const requiredVars = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const optionalVars = ['GOOGLE_SHEET_TAB', 'NOTIFICATION_EMAIL', 'SMTP_USER', 'SMTP_PASS'];

  for (const v of requiredVars) {
    if (process.env[v]) {
      ok(`${v} is set`);
    } else {
      fail(`${v} is MISSING — copy .env.example to .env and fill it in`);
      allGood = false;
    }
  }
  for (const v of optionalVars) {
    if (process.env[v]) {
      ok(`${v} is set (optional)`);
    } else {
      warn(`${v} not set (optional — email alerts will be skipped)`);
    }
  }

  if (!allGood) {
    console.log('\n⛔  Fix the missing env vars above, then re-run `npm run setup`.\n');
    process.exit(1);
  }

  // ── 2. Apollo.io Connection ───────────────────────────────
  section('2 / 4  Apollo.io API');

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        q_keywords: 'HVAC Michigan',
        person_titles: ['owner'],
        person_locations: ['Michigan, United States'],
        organization_num_employees_ranges: ['1,25'],
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 }
    );

    const count = res.data?.pagination?.total_entries ?? '?';
    ok(`Connected. Apollo reports ~${count} total matching contacts.`);

    const sample = res.data?.people?.[0];
    if (sample) {
      ok(`Sample contact: ${sample.first_name} ${sample.last_name} @ ${sample.organization?.name ?? '(no org)'}`);
    } else {
      warn('Apollo returned 0 sample contacts. You may need to broaden filters in config.js.');
    }
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    fail(`Apollo API error (HTTP ${status}): ${detail}`);
    if (status === 401 || status === 403) {
      fail('  → Check your APOLLO_API_KEY in .env');
    }
    allGood = false;
  }

  // ── 3. Google Sheets Connection ───────────────────────────
  section('3 / 4  Google Sheets');

  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const tab = process.env.GOOGLE_SHEET_TAB || 'Leads';

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    ok(`Connected to spreadsheet: "${meta.data.properties.title}"`);

    // Check the tab exists
    const sheetNames = meta.data.sheets.map((s) => s.properties.title);
    if (sheetNames.includes(tab)) {
      ok(`Tab "${tab}" exists.`);
    } else {
      warn(`Tab "${tab}" not found. Available tabs: ${sheetNames.join(', ')}`);
      warn(`Set GOOGLE_SHEET_TAB in .env to one of the tabs above, or create a "${tab}" tab.`);
    }

    // Count existing rows
    const rows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!B:B`,
    });
    const dataRows = (rows.data.values?.length ?? 1) - 1; // subtract header
    ok(`Sheet currently has ${Math.max(0, dataRows)} lead rows.`);
  } catch (err) {
    if (err.message.includes('credentials.json')) {
      fail('credentials.json not found. Download it from Google Cloud Console.');
      console.log(`\n  ${YELLOW}How to get credentials.json:${RESET}`);
      console.log('  1. Go to console.cloud.google.com → APIs & Services → Credentials');
      console.log('  2. Create a new OAuth 2.0 Client ID (Desktop app)');
      console.log('  3. Download the JSON and save it as lead-gen/credentials.json');
      console.log('  4. Run `npm run auth` to authorize and create token.json\n');
    } else {
      fail(`Google Sheets error: ${err.message}`);
      if (err.message.includes('invalid_grant') || err.message.includes('token')) {
        warn('Your token.json may be expired. Delete it and run `npm run auth` again.');
      }
    }
    allGood = false;
  }

  // ── 4. Schedule Summary ───────────────────────────────────
  section('4 / 4  Schedule');
  ok(`Cron: "${config.cronSchedule}" in ${config.timezone}`);
  ok(`Leads per run: up to ${config.maxLeadsPerRun}`);
  ok(`Cities: ${config.targetLocations.map(l => l.split(',')[0]).join(', ')}`);

  // ── Final result ─────────────────────────────────────────
  console.log('\n' + '═'.repeat(50));
  if (allGood) {
    console.log(`${GREEN}${BOLD}✓ All checks passed. Run the workflow with:${RESET}`);
    console.log('\n  node index.js --now    ← test run immediately');
    console.log('  node index.js          ← start cron (runs at 7am ET daily)\n');
  } else {
    console.log(`${RED}${BOLD}⛔ Some checks failed. Fix the issues above before starting.${RESET}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n[setup-check] Unexpected error: ${err.message}`);
  process.exit(1);
});
