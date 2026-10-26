#!/usr/bin/env node
/**
 * index.js — HVAC Lead Generation Workflow
 *
 * Usage:
 *   node index.js --verify      Confirm Apollo + Sheets connections are working
 *   node index.js --run-now     Run one lead pull immediately (good for testing)
 *   node index.js --start       Start the daily 7am ET scheduler (keep process alive)
 */

require('dotenv').config();

const cron       = require('node-cron');
const { searchLeads, testConnection: testApollo } = require('./apollo');
const { appendLeads, testConnection: testSheets }  = require('./sheets');
const { notifyError } = require('./notify');
const { MAX_LEADS_PER_RUN } = require('./config');

// ─── Core workflow ─────────────────────────────────────────────────────────────

async function runWorkflow() {
  const runStart = new Date();
  console.log(`\n[${runStart.toISOString()}] ▶ Starting HVAC lead gen run (max ${MAX_LEADS_PER_RUN} leads)...`);

  try {
    // 1. Search Apollo.io
    console.log('  Searching Apollo.io...');
    const leads = await searchLeads(MAX_LEADS_PER_RUN);
    console.log(`  Apollo returned ${leads.length} qualified lead(s).`);

    if (leads.length === 0) {
      const msg = 'Apollo.io returned zero results for SW Michigan HVAC leads. Check filters or API quota.';
      console.warn(`  ⚠ ${msg}`);
      await notifyError(msg);
      return;
    }

    // 2. Append to Google Sheets (duplicate-safe)
    console.log('  Writing to Google Sheets...');
    const result = await appendLeads(leads);

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    console.log(
      `  ✅ Done in ${elapsed}s — ${result.added} new lead(s) added, ${result.skipped} duplicate(s) skipped.\n`
    );

  } catch (err) {
    const msg = `Workflow failed: ${err.message}`;
    console.error(`  ❌ ${msg}`);
    console.error(err.stack);
    await notifyError(msg);
  }
}

// ─── Connection verification ───────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Connection Verification');
  console.log('══════════════════════════════════════════\n');

  let allOk = true;

  // Env-var presence checks
  const required = [
    ['APOLLO_API_KEY',       'Apollo.io API key'],
    ['SPREADSHEET_ID',       'Google Sheets spreadsheet ID'],
  ];

  const credSet = process.env.GOOGLE_CREDENTIALS_PATH || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credSet) {
    console.error('  ❌ Google credentials missing — set GOOGLE_CREDENTIALS_PATH or GOOGLE_SERVICE_ACCOUNT_KEY');
    allOk = false;
  } else {
    console.log('  ✅ Google credentials configured');
  }

  for (const [key, label] of required) {
    if (!process.env[key]) {
      console.error(`  ❌ ${label} not set (${key})`);
      allOk = false;
    } else {
      console.log(`  ✅ ${label} is set`);
    }
  }

  if (!allOk) {
    console.error('\n  Fix the above before proceeding.\n');
    return false;
  }

  // Live API tests
  console.log('\n  Testing Apollo.io API...');
  try {
    const { sampleCount } = await testApollo();
    console.log(`  ✅ Apollo.io connected — test query returned ${sampleCount} result(s).`);
  } catch (err) {
    console.error(`  ❌ Apollo.io error: ${err.message}`);
    allOk = false;
  }

  console.log('\n  Testing Google Sheets access...');
  try {
    const { firstCell } = await testSheets();
    console.log(`  ✅ Google Sheets connected — first cell: "${firstCell}"`);
  } catch (err) {
    console.error(`  ❌ Google Sheets error: ${err.message}`);
    allOk = false;
  }

  console.log('');
  return allOk;
}

// ─── Scheduler ─────────────────────────────────────────────────────────────────

// Fires at 7:00am every day, Eastern Time
const SCHEDULE = '0 7 * * *';

function startScheduler() {
  const job = cron.schedule(SCHEDULE, runWorkflow, {
    timezone: 'America/New_York',
    scheduled: true,
  });

  const nextRun = getNextRunDescription();
  console.log(`\n  ✅ Scheduler started — next run ${nextRun}`);
  console.log('  Keep this process running. Use pm2 or a systemd service to run it persistently.\n');

  return job;
}

function getNextRunDescription() {
  // Simple human-readable next fire time
  const now   = new Date();
  const next  = new Date();
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', {
    timeZone:     'America/New_York',
    weekday:      'short',
    month:        'short',
    day:          'numeric',
    hour:         'numeric',
    minute:       '2-digit',
    timeZoneName: 'short',
  });
}

// ─── CLI entry point ───────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));

if (args.has('--verify')) {
  verifyConnections().then(ok => {
    if (ok) {
      console.log('  All connections OK. Run with --run-now to test a live pull, or --start to begin scheduling.\n');
    }
    process.exit(ok ? 0 : 1);
  });

} else if (args.has('--run-now')) {
  runWorkflow().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });

} else if (args.has('--start')) {
  verifyConnections().then(ok => {
    if (!ok) { process.exit(1); return; }
    startScheduler();
    // Process stays alive as long as the cron job is running
  });

} else {
  console.log([
    '',
    '  HVAC Lead Generation Workflow',
    '  ──────────────────────────────',
    '  node index.js --verify      Test Apollo + Sheets connections',
    '  node index.js --run-now     Pull up to 25 leads immediately',
    '  node index.js --start       Start 7am ET daily scheduler',
    '',
  ].join('\n'));
}
