'use strict';

/**
 * First-run connection tester.
 *
 * Run this BEFORE starting the scheduler to confirm both APIs are working:
 *
 *   node setup.js
 *
 * What it checks:
 *   1. Apollo.io — authenticates and fires a minimal test search
 *   2. Google Sheets — opens your spreadsheet and reads the title
 *   3. (Optional) Email — sends a test notification if SMTP is configured
 */

require('dotenv').config();
const axios   = require('axios');
const config  = require('./src/config');
const { testConnection } = require('./src/sheets');
const { sendErrorNotification } = require('./src/notify');

const CHECK  = '✅';
const CROSS  = '❌';
const WARN   = '⚠️ ';

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Setup & Connection Test');
  console.log('═══════════════════════════════════════════════════\n');

  let allPassed = true;

  // ── 1. Environment variables ──────────────────────────────────────────────
  console.log('1. Checking environment variables…');
  const vars = {
    APOLLO_API_KEY:          config.apolloApiKey,
    GOOGLE_SHEET_ID:         config.sheetId,
    GOOGLE_CREDENTIALS_PATH: config.credentialsPath,
  };
  const optionalVars = {
    NOTIFY_EMAIL: config.notifyEmail,
    SMTP_USER:    config.smtpUser,
    SMTP_PASS:    config.smtpPass,
  };

  for (const [k, v] of Object.entries(vars)) {
    if (!v) {
      console.log(`   ${CROSS} ${k} is NOT SET — required`);
      allPassed = false;
    } else {
      const preview = k.includes('KEY') || k.includes('PASS')
        ? `${v.slice(0, 6)}…`
        : v;
      console.log(`   ${CHECK} ${k} = ${preview}`);
    }
  }
  for (const [k, v] of Object.entries(optionalVars)) {
    if (!v) {
      console.log(`   ${WARN} ${k} not set (email notifications disabled)`);
    } else {
      console.log(`   ${CHECK} ${k} = ${v}`);
    }
  }

  // ── 2. Apollo.io ──────────────────────────────────────────────────────────
  console.log('\n2. Testing Apollo.io API…');
  if (!config.apolloApiKey) {
    console.log(`   ${CROSS} Skipped — APOLLO_API_KEY not set.`);
    allPassed = false;
  } else {
    try {
      // Minimal search — just check auth works and get credit info
      const res = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        {
          person_titles: ['Owner'],
          person_locations: ['Kalamazoo, Michigan, United States'],
          organization_num_employees_ranges: ['1,25'],
          per_page: 1,
          page: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': config.apolloApiKey,
            'Cache-Control': 'no-cache',
          },
          timeout: 20_000,
        }
      );

      const total = res.data?.pagination?.total_entries ?? 'unknown';
      const returned = res.data?.people?.length ?? 0;
      console.log(`   ${CHECK} Apollo connection successful.`);
      console.log(`         Test search found ${total} total matching contacts.`);
      console.log(`         Returned ${returned} contact in this test (per_page=1).`);

      if (returned > 0) {
        const p = res.data.people[0];
        const hasPhone = (p.phone_numbers ?? []).length > 0;
        console.log(`         Sample contact: ${p.first_name} ${p.last_name} @ ${p.organization?.name ?? 'N/A'} — phone: ${hasPhone ? 'YES' : 'no'}`);
      }
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message ?? err.message;
      console.log(`   ${CROSS} Apollo connection FAILED (HTTP ${status ?? 'N/A'}): ${detail}`);
      if (status === 401) {
        console.log('         → Your APOLLO_API_KEY looks wrong. Double-check it in .env.');
      } else if (status === 429) {
        console.log('         → Rate limited or credits exhausted. Try again later.');
      }
      allPassed = false;
    }
  }

  // ── 3. Google Sheets ──────────────────────────────────────────────────────
  console.log('\n3. Testing Google Sheets connection…');
  if (!config.sheetId) {
    console.log(`   ${CROSS} Skipped — GOOGLE_SHEET_ID not set.`);
    allPassed = false;
  } else {
    try {
      const title = await testConnection();
      console.log(`   ${CHECK} Google Sheets connection successful.`);
      console.log(`         Spreadsheet: "${title}"`);
      console.log(`         Target tab:  "${config.sheetTab}"`);
    } catch (err) {
      console.log(`   ${CROSS} Google Sheets FAILED: ${err.message}`);
      if (err.message.includes('not found')) {
        console.log('         → Make sure your service account email has edit access to the sheet.');
        console.log('         → See credentials/README.md for instructions.');
      }
      allPassed = false;
    }
  }

  // ── 4. Email notification (optional) ─────────────────────────────────────
  if (config.smtpUser && config.smtpPass && config.notifyEmail) {
    console.log('\n4. Sending test email notification…');
    try {
      await sendErrorNotification(
        'Setup test — connection verified',
        'This is a test message from your HVAC Lead Gen setup script.\n' +
        'If you received this, email notifications are working correctly.\n\n' +
        `Config: ${config.maxLeadsPerRun} leads/run, schedule "${config.cronSchedule}" (${config.timezone})`
      );
      console.log(`   ${CHECK} Test email sent to ${config.notifyEmail}`);
    } catch (err) {
      console.log(`   ${CROSS} Email failed: ${err.message}`);
    }
  } else {
    console.log('\n4. Email notification: skipped (SMTP not configured — see .env.example)');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  if (allPassed) {
    console.log(`${CHECK} All checks passed! You are ready to run the scheduler.\n`);
    console.log('  Start the scheduler:  node index.js');
    console.log('  Run one cycle now:    node src/workflow.js');
    console.log('  Start + run now:      node index.js --run-now\n');
  } else {
    console.log(`${CROSS} Some checks FAILED. Fix the issues above, then re-run: node setup.js\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Setup script crashed:', err);
  process.exit(1);
});
