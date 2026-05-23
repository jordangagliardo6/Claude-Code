'use strict';

/**
 * First-run verification script.
 * Run: node verify.js
 *
 * Checks:
 *  1. .env exists and all required variables are set
 *  2. Apollo API key is valid (test search with 1 result)
 *  3. Google Sheets connection works and header row is correct
 *  4. Email transport (if configured)
 */

require('dotenv').config();
const config = require('./src/config');

const REQUIRED_ENV = ['APOLLO_API_KEY', 'SPREADSHEET_ID'];

function check(label, value, pass) {
  const icon = pass ? '✅' : '❌';
  console.log(`  ${icon}  ${label}: ${value}`);
  return pass;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — First-Run Verification');
  console.log('══════════════════════════════════════════════════════\n');

  let allOk = true;

  // ── 1. Environment variables ──────────────────────────────────────────────
  console.log('[ 1/4 ] Environment variables');
  for (const key of REQUIRED_ENV) {
    const ok = check(key, config[key] ? '(set)' : '(MISSING)', !!config[key]);
    if (!ok) allOk = false;
  }
  // Optional but recommended
  check('SMTP_USER', config.SMTP_USER ? '(set)' : '(not set — email alerts disabled)', true);
  check('TZ', process.env.TZ || 'America/New_York (default)', true);

  // ── 2. Apollo API ─────────────────────────────────────────────────────────
  console.log('\n[ 2/4 ] Apollo.io API');
  if (!config.APOLLO_API_KEY) {
    console.log('  ❌  Skipping — APOLLO_API_KEY not set');
    allOk = false;
  } else {
    try {
      const axios = require('axios');
      const response = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        {
          per_page: 1,
          page: 1,
          person_locations: ['Michigan, United States'],
          organization_num_employees_ranges: ['1,25'],
          q_organization_keyword_tags: ['hvac'],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': config.APOLLO_API_KEY,
          },
        }
      );
      const total = response.data?.pagination?.total_entries ?? 0;
      check('Apollo search', `OK — ${total.toLocaleString()} total records found`, true);
    } catch (err) {
      const detail = err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
      check('Apollo search', `FAILED — ${detail}`, false);
      allOk = false;
    }
  }

  // ── 3. Google Sheets ──────────────────────────────────────────────────────
  console.log('\n[ 3/4 ] Google Sheets');
  try {
    const { verifyConnection } = require('./src/sheetsService');
    const result = await verifyConnection();
    check('Spreadsheet access', `OK — "${result.sheetTab}" tab found`, true);
    check('Header row', result.headerRow.length > 0
      ? result.headerRow.join(', ')
      : '(empty — headers not yet written)', result.headerRow.length > 0);
  } catch (err) {
    check('Spreadsheet access', `FAILED — ${err.message}`, false);
    allOk = false;
  }

  // ── 4. Email transport ────────────────────────────────────────────────────
  console.log('\n[ 4/4 ] Email notifications');
  if (!config.SMTP_USER || !config.SMTP_PASS) {
    console.log('  ⚠️   SMTP not configured — email alerts will be skipped (console-only).');
    console.log('       Set SMTP_USER and SMTP_PASS in .env to enable.');
  } else {
    try {
      const nodemailer = require('nodemailer');
      const transport = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      });
      await transport.verify();
      check('SMTP connection', `OK — ${config.SMTP_HOST}:${config.SMTP_PORT}`, true);
    } catch (err) {
      check('SMTP connection', `FAILED — ${err.message}`, false);
      // Email is optional — don't fail the whole check
      console.log('  ℹ️   Workflow will still run; errors will log to console only.');
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  if (allOk) {
    console.log('  ✅  All checks passed. You\'re ready to go!');
    console.log('');
    console.log('  Next steps:');
    console.log('    • Test one run right now:  npm run run-now');
    console.log('    • Start the scheduler:     npm start');
    console.log(`    • Scheduled time:          ${config.CRON_SCHEDULE} (${process.env.TZ || 'America/New_York'})`);
    console.log(`    • Spreadsheet:             https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}/edit`);
  } else {
    console.log('  ❌  Some checks failed. Fix the issues above before running the scheduler.');
  }
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error('Unexpected error during verification:', err);
  process.exit(1);
});
