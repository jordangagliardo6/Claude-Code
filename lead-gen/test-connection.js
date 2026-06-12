/**
 * test-connection.js — Pre-flight check before the first scheduled run.
 *
 * Run this once after setup to confirm both APIs are reachable:
 *
 *   cd lead-gen
 *   npm run test-connection
 *
 * Exit code 0 = all good.  Exit code 1 = at least one check failed.
 */

require('dotenv').config();

const axios = require('axios');
const { testConnection: testSheets } = require('./sheets');

// ── Apollo check ──────────────────────────────────────────────────────────────

async function testApollo() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in .env');

  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      page: 1,
      per_page: 1,
      person_titles: ['Owner'],
      organization_locations: ['Michigan, United States'],
      organization_num_employees_ranges: ['1,25'],
      organization_naics_codes: ['238220'],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      timeout: 15_000,
    }
  );

  const total = response.data.pagination?.total_entries
    ?? response.data.people?.length
    ?? 0;

  return total;
}

// ── Apollo phone-number plan check ───────────────────────────────────────────

async function checkPhoneAccess() {
  const apiKey = process.env.APOLLO_API_KEY;

  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      page: 1,
      per_page: 3,
      person_titles: ['Owner'],
      organization_locations: ['Michigan, United States'],
      organization_num_employees_ranges: ['1,25'],
      organization_naics_codes: ['238220'],
    },
    {
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      timeout: 15_000,
    }
  );

  const people = response.data.people || [];
  const withPhones = people.filter(p => (p.phone_numbers || []).length > 0);
  return { total: people.length, withPhones: withPhones.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let allPassed = true;

  console.log('\nRunning pre-flight connection checks…\n');

  // ── Check 1: Apollo API ───────────────────────────────────────────────────
  process.stdout.write('  1. Apollo.io API key         … ');
  try {
    const total = await testApollo();
    console.log(`OK  (${total.toLocaleString()} potential leads found in Michigan)`);
  } catch (err) {
    console.log(`FAIL\n     └─ ${err.message}`);
    allPassed = false;
  }

  // ── Check 2: Apollo phone number access ──────────────────────────────────
  process.stdout.write('  2. Apollo phone number access … ');
  try {
    const { total, withPhones } = await checkPhoneAccess();
    if (withPhones > 0) {
      console.log(`OK  (${withPhones}/${total} sample contacts have phone numbers)`);
    } else if (total > 0) {
      console.log(
        `WARN (0/${total} sample contacts returned phone numbers)\n` +
        `     └─ Your Apollo plan may not include phone data.\n` +
        `        Basic plan ($49/mo) or higher is required for phone access.\n` +
        `        The workflow will still run but may add 0 leads per cycle.`
      );
    } else {
      console.log('WARN (no sample contacts returned — cannot verify phone access)');
    }
  } catch (err) {
    console.log(`FAIL\n     └─ ${err.message}`);
    allPassed = false;
  }

  // ── Check 3: Google Sheets ────────────────────────────────────────────────
  process.stdout.write('  3. Google Sheets connection   … ');
  try {
    const title = await testSheets();
    console.log(`OK  (connected to: "${title}")`);
  } catch (err) {
    console.log(`FAIL\n     └─ ${err.message}`);
    allPassed = false;
  }

  // ── Check 4: Notification email ───────────────────────────────────────────
  process.stdout.write('  4. Notification email config  … ');
  const email = process.env.NOTIFICATION_EMAIL;
  const smtpReady = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (email && smtpReady) {
    console.log(`OK  (alerts → ${email} via ${process.env.SMTP_HOST})`);
  } else if (email && !smtpReady) {
    console.log(
      `WARN (NOTIFICATION_EMAIL set but SMTP_HOST/SMTP_USER/SMTP_PASS missing)\n` +
      `     └─ Errors will still log to console. Set SMTP vars to get email alerts.`
    );
  } else {
    console.log('SKIP (NOTIFICATION_EMAIL not set — errors will only log to console)');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  if (allPassed) {
    console.log('All checks passed.\n');
    console.log('Next steps:');
    console.log('  • Run once manually:   npm run run-now');
    console.log('  • Start scheduler:     npm start');
    console.log('    (runs every day at 7:00am Eastern)\n');
  } else {
    console.log('One or more checks failed. Fix the errors above before running.\n');
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('\nUnexpected error during connection test:', err.message);
  process.exit(1);
});
