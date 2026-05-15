/**
 * First-run setup and connection validator
 *
 * Run this BEFORE starting the scheduler to confirm that:
 *   1. Your .env file is complete
 *   2. Apollo.io API key is valid and returns results
 *   3. Google service account can access your spreadsheet
 *
 * Usage:
 *   node setup.js
 *   npm run setup
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(label) {
  console.log(`  ✓  ${label}`);
}

function fail(label, detail = '') {
  console.error(`  ✗  ${label}${detail ? `: ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ─── 1. Env variable checks ───────────────────────────────────────────────────

function checkEnv() {
  section('Step 1 — Environment variables');

  const required = {
    APOLLO_API_KEY: 'Apollo.io API key',
    SPREADSHEET_ID: 'Google Sheets spreadsheet ID',
    GOOGLE_CREDENTIALS_PATH: 'Path to Google service account JSON',
  };

  let allOk = true;
  for (const [key, label] of Object.entries(required)) {
    if (process.env[key]) {
      pass(`${key} is set (${label})`);
    } else {
      fail(`${key} is missing`, label);
      allOk = false;
    }
  }

  // Optional but warn if absent
  const optional = ['ALERT_EMAIL', 'SMTP_USER', 'SMTP_PASS'];
  const emailConfigured = optional.every(k => process.env[k]);
  if (emailConfigured) {
    pass('Email alert credentials configured');
  } else {
    console.log(`  ℹ  Email alerts not configured (ALERT_EMAIL / SMTP_* missing) — errors will only be logged`);
  }

  const credPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json');
  if (fs.existsSync(credPath)) {
    pass(`Service account file found: ${credPath}`);
  } else {
    fail('Service account file NOT found', credPath);
    allOk = false;
  }

  return allOk;
}

// ─── 2. Apollo connection test ────────────────────────────────────────────────

async function checkApollo() {
  section('Step 2 — Apollo.io connection');

  const { testConnection, searchHVACLeads } = require('./src/apollo');

  try {
    await testConnection();
    pass('API key accepted by Apollo');
  } catch (err) {
    fail('Apollo connection failed', err.message);
    return false;
  }

  // Do a live search to confirm filters work
  console.log('\n  Running a sample search (fetching 5 results)...');
  try {
    const leads = await searchHVACLeads(5, 1);
    if (leads.length > 0) {
      pass(`Sample search returned ${leads.length} lead(s)`);
      console.log('\n  Sample lead (first result):');
      const sample = leads[0];
      console.log(`    Business : ${sample.businessName}`);
      console.log(`    Contact  : ${sample.firstName} ${sample.lastName}`);
      console.log(`    Phone    : ${sample.phone}`);
      console.log(`    City     : ${sample.city}`);
      console.log(`    Website  : ${sample.website || '(none)'}`);
    } else {
      console.log('  ℹ  Search returned 0 results with current filters.');
      console.log('     This may be normal if Apollo has limited data for these filters.');
      console.log('     The workflow will still run — try broadening industries or locations in src/apollo.js.');
    }
    return true;
  } catch (err) {
    fail('Sample search failed', err.message);
    return false;
  }
}

// ─── 3. Google Sheets connection test ─────────────────────────────────────────

async function checkSheets() {
  section('Step 3 — Google Sheets connection');

  const { testConnection } = require('./src/sheets');

  let title;
  try {
    title = await testConnection();
    pass(`Connected to spreadsheet: "${title}"`);
  } catch (err) {
    fail('Google Sheets connection failed', err.message);
    console.log('\n  Troubleshooting tips:');
    console.log('  • Is the SPREADSHEET_ID correct? (copy from the URL)');
    console.log('  • Did you share the spreadsheet with the service account email?');
    console.log('    The email is in your google-service-account.json under "client_email".');
    console.log('  • Did you enable the Google Sheets API in your Google Cloud project?');
    return false;
  }

  return true;
}

// ─── 4. Instructions for Google service account ───────────────────────────────

function printGoogleSetupInstructions() {
  section('How to create a Google Service Account (if you haven\'t yet)');
  console.log(`
  1. Go to https://console.cloud.google.com/
  2. Create a new project (or select an existing one).
  3. Enable the Google Sheets API:
     APIs & Services → Library → search "Google Sheets API" → Enable
  4. Create a Service Account:
     APIs & Services → Credentials → Create Credentials → Service Account
     Give it any name, click Done.
  5. Create a JSON key:
     Click the service account → Keys tab → Add Key → Create new key → JSON
     A file downloads. Save it as:
       lead-gen-workflow/credentials/google-service-account.json
  6. Share your spreadsheet with the service account:
     Open the spreadsheet → Share → paste the "client_email" from the JSON
     Give it "Editor" access.
  7. Copy your Spreadsheet ID from the URL:
     https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
     Paste it into .env as SPREADSHEET_ID.
  `);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n=========================================================');
  console.log('  HVAC Lead Gen — First-Run Setup & Connection Check');
  console.log('=========================================================');

  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json'
  );
  if (!fs.existsSync(credPath)) {
    printGoogleSetupInstructions();
  }

  const envOk = checkEnv();
  if (!envOk) {
    console.log('\n⚠  Fix the missing environment variables in your .env file and re-run setup.js.\n');
    process.exit(1);
  }

  const apolloOk = await checkApollo();
  const sheetsOk = await checkSheets();

  section('Summary');
  if (apolloOk && sheetsOk) {
    console.log(`
  ✓  Both connections are working.

  You're ready to go! Start the scheduler with:
    node index.js          (runs daily at 7 AM Eastern)

  Or do an immediate one-off run with:
    node index.js --once

  Logs are written to:
    logs/run.log    — all activity
    logs/error.log  — errors only
`);
  } else {
    console.log('\n  ✗  One or more connections failed. Fix the issues above and re-run setup.js.\n');
    process.exit(1);
  }
})();
