'use strict';

/**
 * First-run connection test.
 * Run with:  node setup.js
 *
 * Checks:
 *  1. .env file is present and has required keys
 *  2. Apollo.io API key is valid
 *  3. Google Sheets credentials are valid and the spreadsheet is accessible
 *  4. Optionally fires one live Apollo search and prints sample results
 */

require('dotenv').config();

const readline = require('readline');

async function main() {
  let allGood = true;

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   HVAC Lead-Gen Workflow — Setup & Connection Test    ');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── 1. Env vars ────────────────────────────────────────────────────────────
  console.log('[ 1/3 ] Checking environment variables…');
  const checks = {
    APOLLO_API_KEY:        !!process.env.APOLLO_API_KEY,
    GOOGLE_SPREADSHEET_ID: !!process.env.GOOGLE_SPREADSHEET_ID,
  };
  for (const [key, ok] of Object.entries(checks)) {
    console.log(`        ${ok ? '✓' : '✗'} ${key}${ok ? '' : '  ← MISSING — add to .env'}`);
    if (!ok) allGood = false;
  }

  // Show optional vars status
  const optionals = ['GOOGLE_SERVICE_ACCOUNT_KEY_FILE', 'GOOGLE_CLIENT_EMAIL', 'NOTIFICATION_EMAIL'];
  for (const key of optionals) {
    const val = process.env[key];
    console.log(`        ${val ? '✓' : '○'} ${key}${val ? '' : '  (optional — not set)'}`);
  }

  if (!allGood) {
    console.log('\n  Fix the missing variables in .env, then run setup.js again.\n');
    process.exit(1);
  }

  // ── 2. Apollo connection ───────────────────────────────────────────────────
  console.log('\n[ 2/3 ] Testing Apollo.io connection…');
  try {
    const apollo = require('./src/apollo');
    const ok = await apollo.testConnection();
    if (ok) {
      console.log('        ✓ Apollo API key is valid and responding.');
    } else {
      throw new Error('Unexpected response from Apollo — check your API key.');
    }
  } catch (err) {
    console.log(`        ✗ Apollo connection failed: ${err.message}`);
    if (err.response?.status === 401) console.log('          → API key is invalid or expired.');
    if (err.response?.status === 429) console.log('          → Rate limit hit. Wait a minute and try again.');
    allGood = false;
  }

  // ── 3. Google Sheets connection ────────────────────────────────────────────
  console.log('\n[ 3/3 ] Testing Google Sheets connection…');
  try {
    const sheets = require('./src/sheets');
    await sheets.testConnection();
    console.log(`        ✓ Connected to spreadsheet ${process.env.GOOGLE_SPREADSHEET_ID}`);
    console.log(`        ✓ Sheet tab: "${process.env.GOOGLE_SHEET_NAME || 'Sheet1'}"`);
  } catch (err) {
    console.log(`        ✗ Google Sheets failed: ${err.message}`);
    if (err.message.includes('credentials not found')) {
      console.log('          → Place your service-account.json in ./credentials/');
      console.log('            OR set GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY in .env');
    }
    if (err.message.includes('403') || err.message.includes('PERMISSION_DENIED')) {
      console.log('          → Share the spreadsheet with your service account email and try again.');
    }
    allGood = false;
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────');
  if (!allGood) {
    console.log('  Some checks failed. Fix the issues above and re-run.\n');
    process.exit(1);
  }

  console.log('  All connections verified.\n');
  console.log('  Configuration summary:');
  const cfg = require('./src/config');
  console.log(`    Cities:        ${cfg.TARGET_CITIES.join(', ')}`);
  console.log(`    Job titles:    ${cfg.JOB_TITLES.join(', ')}`);
  console.log(`    Company size:  ${cfg.EMPLOYEE_RANGES[0]} employees`);
  console.log(`    Max per run:   ${cfg.MAX_LEADS_PER_RUN} leads`);
  console.log(`    Schedule:      ${cfg.CRON_SCHEDULE} ${cfg.CRON_TIMEZONE}  (7:00 AM Eastern daily)`);
  console.log('───────────────────────────────────────────────────────\n');

  // ── Optional live test search ──────────────────────────────────────────────
  const answer = await ask('  Run a live test search now and preview up to 5 leads? [y/N] ');
  if (answer.toLowerCase() === 'y') {
    console.log('\n  Searching Apollo… (this may take 10-15 seconds)\n');
    try {
      const apollo = require('./src/apollo');
      const { leads, totalEntries } = await apollo.searchLeads(1);
      console.log(`  Apollo reports ${totalEntries} total matching contacts.`);
      console.log(`  Leads with phone numbers on page 1: ${leads.length}\n`);
      const sample = leads.slice(0, 5);
      sample.forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.businessName}`);
        console.log(`     ${l.firstName} ${l.lastName} — ${l.title}`);
        console.log(`     📞 ${l.phone}  |  📍 ${l.city}  |  🌐 ${l.website || '(none)'}`);
      });
      if (leads.length === 0) {
        console.log('  No leads returned. Try broadening the search in src/config.js.');
      }
    } catch (err) {
      console.log(`  Live search failed: ${err.message}`);
    }
  }

  console.log('\n  To start the scheduler:      npm start');
  console.log('  To run workflow immediately: npm run run-now\n');
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

main().catch((err) => { console.error('\nSetup crashed:', err.message); process.exit(1); });
