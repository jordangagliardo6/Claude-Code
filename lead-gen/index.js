/**
 * index.js — HVAC Lead Generation Scheduler
 *
 * Usage:
 *   node index.js           Start the cron scheduler (runs daily at 7am ET)
 *   node index.js --test    Verify connections to Apollo and Google Sheets,
 *                           then immediately run one lead pull to confirm
 *                           everything works end-to-end.
 *
 * Environment: copy .env.example → .env and fill in your credentials.
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./workflow');
const { notifyError } = require('./notify');

// ── Helper: safe run with error capture ──────────────────────────────────────

async function safeRun(context) {
  try {
    await runWorkflow();
  } catch (err) {
    await notifyError(context, err);
  }
}

// ── --test mode ───────────────────────────────────────────────────────────────
// Verify that both APIs are reachable, then do one real run so you can confirm
// leads land in the sheet before the first scheduled firing.

if (process.argv.includes('--test')) {
  (async () => {
    console.log('\n╔═══════════════════════════════════╗');
    console.log('║   HVAC Lead Gen — Connection Test  ║');
    console.log('╚═══════════════════════════════════╝\n');

    // ── 1. Check env vars ──────────────────────────────────────────────────
    const required = ['APOLLO_API_KEY', 'SPREADSHEET_ID'];
    const hasSheetAuth =
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ||
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;

    const missing = required.filter((k) => !process.env[k]);
    if (!hasSheetAuth) missing.push('GOOGLE_SERVICE_ACCOUNT_KEY_FILE (or _JSON)');

    if (missing.length > 0) {
      console.error('✗ Missing required environment variables:');
      missing.forEach((k) => console.error(`    ${k}`));
      console.error('\nFix these in your .env file and re-run --test.\n');
      process.exit(1);
    }
    console.log('✓ Environment variables look good.\n');

    // ── 2. Test Google Sheets connection ───────────────────────────────────
    console.log('Testing Google Sheets connection...');
    try {
      const { testConnection } = require('./sheets');
      const title = await testConnection(process.env.SPREADSHEET_ID);
      console.log(`✓ Google Sheets connected — spreadsheet: "${title}"\n`);
    } catch (err) {
      console.error(`✗ Google Sheets connection failed:\n  ${err.message}`);
      console.error('\nTroubleshooting:');
      console.error('  1. Make sure your service account JSON key is correct.');
      console.error(`  2. Share the spreadsheet with your service account email`);
      console.error(`     (find it in the "client_email" field of your JSON key).`);
      console.error(`  3. Give it "Editor" access.\n`);
      process.exit(1);
    }

    // ── 3. Test Apollo connectivity (lightweight HEAD check) ───────────────
    console.log('Testing Apollo.io API key...');
    try {
      const axios = require('axios');
      await axios.get('https://api.apollo.io/api/v1/auth/health', {
        headers: { 'x-api-key': process.env.APOLLO_API_KEY },
        timeout: 10000,
      });
      console.log('✓ Apollo.io API key is valid.\n');
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        console.error('✗ Apollo API key is invalid or lacks permissions.');
        console.error('  Check APOLLO_API_KEY in your .env file.\n');
        process.exit(1);
      }
      // 404 or other non-auth errors still mean the key was accepted
      console.log('✓ Apollo.io reachable (key accepted).\n');
    }

    // ── 4. Live run ────────────────────────────────────────────────────────
    console.log('Running a live workflow pull now...\n');
    try {
      const result = await runWorkflow();
      console.log('\n✓ Test run complete.');
      console.log(`  ${result.added} new lead(s) written to your Google Sheet.`);
      console.log(`  ${result.skipped} duplicate(s) skipped.`);
      if (result.added > 0) {
        console.log(
          `\n  Open your sheet: https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`
        );
      }
      console.log('\nAll systems go — start the scheduler with:  node index.js\n');
    } catch (err) {
      console.error(`\n✗ Live run failed: ${err.message}\n`);
      process.exit(1);
    }

    process.exit(0);
  })();

} else {
  // ── Scheduler mode ─────────────────────────────────────────────────────────
  // Cron expression: "0 7 * * 1-5"  → 7:00am Mon–Fri
  // Change to "0 7 * * *"           → 7:00am every day including weekends
  //
  // node-cron does NOT know about timezones natively.
  // America/New_York is UTC-4 (EDT) or UTC-5 (EST).
  // "0 12 * * *" = noon UTC = 7am ET in summer (EDT).
  // "0 11 * * *" = 11am UTC = 7am ET in winter (EST).
  //
  // Best approach: run the server in the America/New_York timezone:
  //   TZ=America/New_York node index.js
  //
  // With TZ set, "0 7 * * *" fires at exactly 7am local time year-round.

  const CRON_EXPRESSION = '0 7 * * *';   // 7:00am in server's local timezone

  console.log('HVAC Lead Gen Scheduler started.');
  console.log(`Cron: "${CRON_EXPRESSION}" — fires at 7:00am server local time.`);
  console.log('Tip:  Run with  TZ=America/New_York node index.js  for Eastern Time.\n');

  cron.schedule(CRON_EXPRESSION, () => {
    safeRun('scheduled cron');
  });

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\nScheduler stopped.');
    process.exit(0);
  });
}
