'use strict';

/**
 * First-run setup and connection test.
 * Run this BEFORE starting the scheduler to confirm both APIs are working.
 *
 *   node setup.js
 */
require('dotenv').config();
const axios = require('axios');
const { testConnection } = require('./src/sheets');

const STEP_PASS = '  ✓';
const STEP_FAIL = '  ✗';

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(' HVAC Lead Gen — Setup & Connection Test');
  console.log('═'.repeat(60) + '\n');

  let allPassed = true;

  // ── Step 1: Environment variables ──────────────────────────────────────────
  console.log('Step 1: Checking environment variables...');
  const required = {
    APOLLO_API_KEY: 'Apollo.io API key',
    GOOGLE_SPREADSHEET_ID: 'Google Spreadsheet ID',
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH: 'Path to Google service account JSON',
  };
  const optional = {
    GOOGLE_SHEET_NAME: `Sheet tab name (default: "Sheet1")`,
    MAX_LEADS_PER_RUN: 'Max leads per run (default: 25)',
    CRON_SCHEDULE: 'Cron schedule (default: 0 12 * * *)',
    ALERT_EMAIL_TO: 'Error alert recipient email',
    ALERT_EMAIL_FROM: 'Gmail sender address',
    GMAIL_APP_PASSWORD: 'Gmail App Password',
  };

  let envOk = true;
  for (const [key, label] of Object.entries(required)) {
    if (process.env[key]) {
      console.log(`${STEP_PASS} ${key} — set`);
    } else {
      console.log(`${STEP_FAIL} ${key} — MISSING (${label})`);
      envOk = false;
      allPassed = false;
    }
  }
  for (const [key, label] of Object.entries(optional)) {
    const val = process.env[key];
    console.log(`  ○ ${key} — ${val ? `"${val}"` : `not set (${label})`}`);
  }
  if (!envOk) {
    console.log('\nFix the missing variables in your .env file and re-run setup.js\n');
    process.exit(1);
  }

  // ── Step 2: Apollo.io API ───────────────────────────────────────────────────
  console.log('\nStep 2: Testing Apollo.io connection...');
  try {
    const res = await axios.get('https://api.apollo.io/v1/auth/health', {
      params: { api_key: process.env.APOLLO_API_KEY },
      timeout: 10_000,
    });
    if (res.data?.is_logged_in) {
      console.log(`${STEP_PASS} Apollo.io connected`);
      if (res.data.user) {
        const u = res.data.user;
        console.log(`     Account: ${u.name || u.email} (${u.organization_name || 'unknown org'})`);
      }
    } else {
      // Some Apollo plans return 200 but not is_logged_in
      console.log(`${STEP_PASS} Apollo.io responded (plan may not expose /auth/health detail)`);
    }
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.log(`${STEP_FAIL} Apollo.io — invalid API key (HTTP ${err.response.status})`);
      console.log('     Get your key at: https://app.apollo.io/#/settings/integrations/api');
      allPassed = false;
    } else if (err.response?.status === 404) {
      // /auth/health may not exist on all plans — try a minimal search instead
      console.log('  ~ Apollo.io /auth/health not found — verifying with a minimal search...');
      try {
        await axios.post('https://api.apollo.io/v1/mixed_people/search', {
          api_key: process.env.APOLLO_API_KEY,
          per_page: 1,
          page: 1,
          person_titles: ['Owner'],
          organization_locations: ['Kalamazoo, Michigan, United States'],
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 });
        console.log(`${STEP_PASS} Apollo.io connected (search endpoint responding)`);
      } catch (searchErr) {
        console.log(`${STEP_FAIL} Apollo.io search failed: ${searchErr.response?.data?.message || searchErr.message}`);
        allPassed = false;
      }
    } else {
      console.log(`${STEP_FAIL} Apollo.io error: ${err.message}`);
      allPassed = false;
    }
  }

  // ── Step 3: Google Sheets ───────────────────────────────────────────────────
  console.log('\nStep 3: Testing Google Sheets connection...');
  try {
    const title = await testConnection();
    console.log(`${STEP_PASS} Google Sheets connected`);
    console.log(`     Spreadsheet: "${title}"`);
    console.log(`     ID: ${process.env.GOOGLE_SPREADSHEET_ID}`);
  } catch (err) {
    console.log(`${STEP_FAIL} Google Sheets error: ${err.message}`);
    if (err.message.includes('not found')) {
      console.log('     Hint: Make sure the service account email has "Editor" access to the spreadsheet.');
      console.log('     Share the sheet with the "client_email" from your service account JSON.');
    }
    allPassed = false;
  }

  // ── Result ──────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  if (allPassed) {
    console.log('All checks passed! You are ready to go.\n');
    console.log('To run immediately:    node run-now.js');
    console.log('To start scheduler:    node index.js');
    console.log('  (runs daily at 7am Eastern — set CRON_SCHEDULE in .env to change)\n');
  } else {
    console.log('Some checks failed. Fix the issues above and re-run: node setup.js\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnexpected setup error:', err.message);
  process.exit(1);
});
