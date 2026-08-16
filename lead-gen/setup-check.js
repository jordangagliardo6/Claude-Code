'use strict';

/**
 * setup-check.js — First-run connection verification
 *
 * Run this BEFORE starting the scheduler to confirm both Apollo and
 * Google Sheets are connected and configured correctly:
 *
 *   node setup-check.js
 *
 * A green ✅ next to each check means you're ready to go.
 * A red ❌ means something needs fixing before your first scheduled run.
 */

require('dotenv').config();
const axios = require('axios');
const { verifySpreadsheet, COLUMNS } = require('./src/sheets');

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('   HVAC Lead Gen — Setup Connection Check');
  console.log('══════════════════════════════════════════════════\n');

  let allPassed = true;

  // ── Check 1: .env loaded ──────────────────────────────────────────────────
  const requiredEnv = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_CREDENTIALS_PATH'];
  console.log('[ 1 ] Checking required environment variables...');
  let envOk = true;
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      console.log(`      ❌ Missing: ${key} (not set in .env)`);
      envOk = false;
    }
  }
  if (envOk) {
    console.log('      ✅ All required env vars found\n');
  } else {
    console.log('      → Copy .env.example to .env and fill in the missing values\n');
    allPassed = false;
  }

  // ── Check 2: Apollo API key ───────────────────────────────────────────────
  console.log('[ 2 ] Checking Apollo.io API key...');
  try {
    // Use the user profile endpoint — available on all plans, no credit cost
    const res = await axios.get('https://api.apollo.io/api/v1/users/me', {
      params: { api_key: process.env.APOLLO_API_KEY },
      timeout: 10000,
    });
    const user = res.data?.user || res.data;
    const email = user?.email || 'unknown';
    const plan = user?.plan_tier || user?.account?.plan_tier || 'unknown';
    console.log(`      ✅ Connected as: ${email}`);
    console.log(`      Plan: ${plan}`);

    // Warn if on a free plan — People Search requires paid
    if (typeof plan === 'string' && plan.toLowerCase().includes('free')) {
      console.log('      ⚠️  WARNING: Free plan detected.');
      console.log('         The People Search API (/mixed_people/api_search) requires');
      console.log('         a paid plan (Basic $49/mo or higher). Upgrade at apollo.io/pricing\n');
    } else {
      console.log('      ✅ Plan supports People Search API\n');
    }
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    if (status === 401) {
      console.log('      ❌ Invalid API key — check APOLLO_API_KEY in .env');
    } else {
      console.log(`      ❌ Apollo connection failed (${status || 'network error'}): ${detail}`);
    }
    console.log('      → Get your key at: https://developer.apollo.io → API Keys\n');
    allPassed = false;
  }

  // ── Check 3: Google Sheets access ────────────────────────────────────────
  console.log('[ 3 ] Checking Google Sheets connection...');
  try {
    const headers = await verifySpreadsheet();
    console.log(`      ✅ Spreadsheet accessible`);
    console.log(`      Sheet ID: ${process.env.GOOGLE_SHEET_ID}`);

    // Verify the header row matches the expected columns
    const expected = COLUMNS;
    const mismatches = expected.filter((col, i) => {
      const actual = (headers[i] || '').trim();
      return actual.toLowerCase() !== col.toLowerCase();
    });

    if (mismatches.length) {
      console.log(`      ⚠️  Header row mismatch. Expected:`);
      console.log(`         ${expected.join(', ')}`);
      console.log(`         Got:`);
      console.log(`         ${headers.join(', ')}`);
      console.log('         Columns will be written in the expected order regardless.\n');
    } else {
      console.log('      ✅ Header row matches expected columns\n');
    }
  } catch (err) {
    console.log(`      ❌ Google Sheets error: ${err.message}`);

    if (err.message?.includes('credentials') || err.message?.includes('ENOENT')) {
      console.log('      → credentials.json not found. See SETUP.md → Step 2.');
    } else if (err.message?.includes('permission') || err.message?.includes('403')) {
      console.log('      → Share the spreadsheet with your service account email.');
      console.log('         (Find it in credentials.json under "client_email")');
    } else if (err.message?.includes('404')) {
      console.log('      → Spreadsheet not found. Check GOOGLE_SHEET_ID in .env.');
    }
    console.log();
    allPassed = false;
  }

  // ── Check 4: Email notification config (optional) ────────────────────────
  console.log('[ 4 ] Checking email notification config (optional)...');
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.NOTIFICATION_EMAIL) {
    console.log(`      ✅ Email notifications configured → ${process.env.NOTIFICATION_EMAIL}\n`);
  } else {
    console.log('      ℹ️  Email notifications not configured (optional).');
    console.log('         Errors will still be logged to run.log.');
    console.log('         To enable: set GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFICATION_EMAIL in .env\n');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  ✅  All checks passed — ready to run!');
    console.log('');
    console.log('  Test a manual run now:   node run-once.js');
    console.log('  Start the scheduler:     node index.js');
    console.log('  (Scheduler runs daily at 7:00 AM ET)');
  } else {
    console.log('  ❌  Some checks failed. Fix the issues above, then re-run:');
    console.log('       node setup-check.js');
  }
  console.log('══════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Unexpected error during setup check:', err.message);
  process.exit(1);
});
