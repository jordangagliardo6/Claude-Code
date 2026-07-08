/**
 * setup.js — First-run connection test
 *
 * Run this BEFORE starting the scheduler to confirm:
 *   ✓ Apollo.io API key is valid
 *   ✓ Google Sheets OAuth is authorized
 *   ✓ The target spreadsheet exists and has correct headers
 *
 * Usage:
 *   node setup.js
 *
 * ─── One-time setup checklist ─────────────────────────────────────────────────
 *
 * STEP 1: Install dependencies
 *   cd apollo-lead-gen
 *   npm install
 *
 * STEP 2: Create your .env file
 *   cp .env.example .env
 *   (then open .env and fill in APOLLO_API_KEY, GMAIL_USER, GMAIL_APP_PASSWORD)
 *
 * STEP 3: Set up Google Cloud credentials
 *   a. Go to https://console.cloud.google.com/
 *   b. Create a new project (or use an existing one)
 *   c. Enable "Google Sheets API":
 *        APIs & Services → Enable APIs → search "Google Sheets API" → Enable
 *   d. Create OAuth 2.0 credentials:
 *        APIs & Services → Credentials → Create Credentials → OAuth client ID
 *        Application type: Desktop app
 *        Name: Apollo Lead Gen (or anything)
 *   e. Download the JSON file → rename it to "credentials.json"
 *   f. Place it at:  apollo-lead-gen/credentials/credentials.json
 *
 * STEP 4: Run this script
 *   node setup.js
 *   (It will print a URL → open it → authorize → paste the code back here)
 *   token.json is then saved automatically for future runs.
 *
 * STEP 5: Start the scheduler
 *   node index.js          ← runs on schedule (7 AM Eastern daily)
 *   node index.js --now    ← run once right now to test
 */

'use strict';

require('dotenv').config();

const axios = require('axios');

const { getAuthClient, verifySheet }          = require('./lib/sheets');
const { sendErrorNotification }               = require('./lib/notify');
const { SW_MICHIGAN_LOCATIONS }               = require('./lib/apollo');

// ─── Validation helpers ───────────────────────────────────────────────────────

function checkEnv() {
  console.log('\n[ENV] Checking environment variables…');
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
  const missing  = required.filter(k => !process.env[k]);

  if (missing.length) {
    console.error(`  ✗ Missing: ${missing.join(', ')}`);
    console.error('  Copy .env.example to .env and fill in the values.');
    return false;
  }

  const optional = ['NOTIFICATION_EMAIL', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'];
  const missingOpt = optional.filter(k => !process.env[k]);
  if (missingOpt.length) {
    console.warn(`  ⚠ Optional vars not set (email alerts disabled): ${missingOpt.join(', ')}`);
  }

  console.log('  ✓ Required variables present.');
  return true;
}

async function checkApollo() {
  console.log('\n[APOLLO] Testing API key…');
  try {
    const { data } = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'X-Api-Key': process.env.APOLLO_API_KEY },
    });

    if (data.is_logged_in) {
      console.log('  ✓ Apollo API key is valid. Logged in.');
      if (data.user?.organization_name) {
        console.log(`    Account: ${data.user.organization_name}`);
      }
      return true;
    } else {
      console.error('  ✗ Apollo responded but is_logged_in = false. Check your API key.');
      return false;
    }
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message;
    console.error(`  ✗ Apollo API error (HTTP ${status}): ${msg}`);
    console.error('    Get your key at: https://developer.apollo.io → API Keys');
    return false;
  }
}

async function checkSheets() {
  console.log('\n[SHEETS] Testing Google Sheets connection…');
  console.log(`  Target sheet ID: ${process.env.GOOGLE_SHEET_ID}`);

  try {
    const auth   = await getAuthClient();
    const result = await verifySheet(auth);

    if (result.ok) {
      console.log(`  ✓ ${result.message}`);
      console.log(`  Sheet URL: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`);
    } else {
      console.error('  ✗ Sheet verification failed:', result.message);
    }

    return result.ok;
  } catch (err) {
    console.error('  ✗ Sheets error:', err.message);
    return false;
  }
}

function showSearchSummary() {
  console.log('\n[CONFIG] Lead search settings:');
  console.log('  Industries (SIC 1711, 7623, 5074, 5075 + NAICS 238220):');
  console.log('    HVAC, Heating & Air Conditioning, Plumbing, Mechanical Contracting');
  console.log('  Company size: 1–25 employees');
  console.log('  Job titles (strict): Owner, President, Founder, Co-Founder, General Manager');
  console.log('  Locations:');
  SW_MICHIGAN_LOCATIONS.forEach(loc => console.log(`    • ${loc}`));
  console.log(`  Max leads per run: ${process.env.MAX_LEADS_PER_RUN || 25}`);
  console.log('  Schedule: 7:00 AM Eastern, daily');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  Apollo Lead Gen — Setup & Connection Test');
  console.log('═'.repeat(60));

  const envOk    = checkEnv();
  if (!envOk) process.exit(1);

  const apolloOk = await checkApollo();
  const sheetsOk = await checkSheets();

  showSearchSummary();

  console.log('\n' + '═'.repeat(60));

  if (apolloOk && sheetsOk) {
    console.log('✓ All checks passed. You\'re ready to run!\n');
    console.log('  Run once now:      node index.js --now');
    console.log('  Start scheduler:   node index.js');
  } else {
    console.log('✗ Some checks failed. Fix the issues above before starting the scheduler.\n');
    process.exit(1);
  }

  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('\nUnexpected error during setup:', err.message);
  process.exit(1);
});
