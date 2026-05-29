'use strict';

/**
 * HVAC Lead Generator — Main Entry Point
 *
 * Run modes:
 *   node src/index.js          Start the scheduler (runs every day at 7 AM ET)
 *   node src/index.js --test   Test connections only, then exit
 *   node src/index.js --run    Run one lead-fetch cycle immediately, then exit
 *
 * Environment variables: see .env.example
 */

// Load .env before anything else
require('dotenv').config();

const cron      = require('node-cron');
const apollo    = require('./apollo');
const sheets    = require('./sheets');
const leads     = require('./leads');
const { notifyError } = require('./notify');

// ─── Settings ────────────────────────────────────────────────────────────────

const MAX_LEADS   = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10) || 25;
// Default: 7:00 AM every day (system timezone — set TZ=America/New_York in .env)
const CRON_SCHED  = process.env.CRON_SCHEDULE || '0 7 * * *';

// ─── Validation ──────────────────────────────────────────────────────────────

function validateEnv() {
  const required = [
    'APOLLO_API_KEY',
    'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
    'SPREADSHEET_ID',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
        'Copy .env.example → .env and fill in the values.'
    );
  }
}

// ─── Connection Test ─────────────────────────────────────────────────────────

async function runConnectionTest() {
  console.log('\n=== HVAC Lead Generator — Connection Test ===\n');

  // ── Apollo ────────────────────────────────────────────────────────────────
  process.stdout.write('Testing Apollo.io connection...     ');
  try {
    const profile = await apollo.testConnection();
    const name = profile?.user?.name || profile?.name || 'unknown user';
    console.log(`✓  Connected (account: ${name})`);
  } catch (err) {
    console.log('✗  FAILED');
    console.error('   Detail:', err.message);
    process.exitCode = 1;
  }

  // ── Google Sheets ─────────────────────────────────────────────────────────
  process.stdout.write('Testing Google Sheets connection... ');
  try {
    const title = await sheets.testConnection();
    console.log(`✓  Connected (spreadsheet: "${title}")`);
  } catch (err) {
    console.log('✗  FAILED');
    console.error('   Detail:', err.message);
    process.exitCode = 1;
  }

  if (process.exitCode === 1) {
    console.log('\n❌  One or more connections failed. Fix the errors above before running.\n');
  } else {
    console.log(
      '\n✅  Both connections are working! You can now start the scheduler with:\n' +
        '      node src/index.js\n' +
        '   Or run one cycle immediately with:\n' +
        '      node src/index.js --run\n'
    );
  }
}

// ─── Lead Fetch Cycle ────────────────────────────────────────────────────────

async function runLeadFetchCycle() {
  const runTimestamp = new Date().toISOString();
  console.log(`\n[${runTimestamp}] Starting lead fetch cycle (max ${MAX_LEADS} leads)...`);

  // 1. Ensure the spreadsheet has a header row
  await sheets.ensureHeaderRow();

  // 2. Fetch existing business names for dedup
  const existingNames = await sheets.getExistingBusinessNames();
  console.log(`  Sheet already contains ${existingNames.size} unique businesses.`);

  // 3. Fetch leads from Apollo
  const rawLeads = await apollo.fetchLeads(MAX_LEADS * 2); // fetch extra to survive dedup loss
  console.log(`  Apollo returned ${rawLeads.length} contacts with phone numbers.`);

  // 4. Deduplicate
  const newLeads = leads.filterNewLeads(rawLeads, existingNames, MAX_LEADS);
  console.log(`  After deduplication: ${newLeads.length} new leads to add.`);

  if (!newLeads.length) {
    console.log('  Nothing to write — all results already exist in the sheet.');
    return;
  }

  // 5. Append to sheet
  const written = await sheets.appendLeads(newLeads);
  console.log(`  ✓  Wrote ${written} new leads to the sheet.\n`);
  console.log(leads.summarizeLeads(newLeads));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    validateEnv();
  } catch (err) {
    console.error('\n' + err.message + '\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  // ── --test mode ───────────────────────────────────────────────────────────
  if (args.includes('--test')) {
    await runConnectionTest();
    return;
  }

  // ── --run mode (single cycle, then exit) ──────────────────────────────────
  if (args.includes('--run')) {
    try {
      await runLeadFetchCycle();
    } catch (err) {
      await notifyError('Lead fetch cycle failed', err.stack || err.message);
      process.exit(1);
    }
    return;
  }

  // ── Scheduler mode (default) ──────────────────────────────────────────────
  if (!cron.validate(CRON_SCHED)) {
    console.error(`Invalid CRON_SCHEDULE: "${CRON_SCHED}". Using default "0 7 * * *".`);
  }

  const tz = process.env.TZ || 'America/New_York';

  console.log('\n=== HVAC Lead Generator — Scheduler Started ===');
  console.log(`  Schedule : ${CRON_SCHED} (${tz})`);
  console.log(`  Max leads: ${MAX_LEADS} per run`);
  console.log('  Run "node src/index.js --test" to verify connections.\n');

  // Run a connection test on startup so failures are caught early
  console.log('Running startup connection test...');
  try {
    await apollo.testConnection();
    await sheets.testConnection();
    console.log('✓  Connections OK. Scheduler is active.\n');
  } catch (err) {
    const msg = `Startup connection test failed: ${err.message}`;
    await notifyError('Startup connection test failed', err.stack || err.message);
    console.error(msg);
    // Don't exit — the cron may still succeed later if the issue is transient
  }

  cron.schedule(
    CRON_SCHED,
    async () => {
      try {
        await runLeadFetchCycle();
      } catch (err) {
        await notifyError('Lead fetch cycle failed', err.stack || err.message);
      }
    },
    { timezone: tz }
  );
}

main();
