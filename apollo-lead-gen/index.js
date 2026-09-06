'use strict';

// Load environment variables from .env before anything else
require('dotenv').config();

const cron = require('node-cron');
const { searchApolloLeads } = require('./lib/apollo');
const { authorize, getExistingBusinessNames, appendToSheet } = require('./lib/sheets');
const { notifyError } = require('./lib/notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const FETCH_MULTIPLIER = parseInt(process.env.APOLLO_FETCH_MULTIPLIER || '4', 10);

// ─── Main workflow ─────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const runStart = new Date();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Apollo Lead Generation — ${runStart.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log(`${'═'.repeat(60)}`);

  try {
    // Step 1: Read existing business names from the sheet (for dedup)
    console.log('\n[1/4] Reading existing leads from Google Sheet...');
    const existingNames = await getExistingBusinessNames();
    console.log(`  ${existingNames.size} businesses already in sheet`);

    // Step 2: Search Apollo — fetch extra to compensate for dedup losses
    console.log(`\n[2/4] Searching Apollo.io for SW Michigan HVAC owners...`);
    const fetchLimit = MAX_LEADS * FETCH_MULTIPLIER;
    let candidates;
    try {
      candidates = await searchApolloLeads(fetchLimit);
    } catch (apolloErr) {
      await notifyError(apolloErr, 'Apollo search');
      console.error('  Aborting run — Apollo search failed.');
      return;
    }

    if (candidates.length === 0) {
      console.log('\n  Apollo returned 0 results matching your filters.');
      console.log('  This can happen when your plan does not support the search API');
      console.log('  or when all available contacts are already in your sheet.');
      await notifyError(
        new Error('Apollo returned 0 candidates — check plan access and filters'),
        'Apollo search (zero results)'
      );
      return;
    }

    // Step 3: Deduplicate against existing sheet entries
    console.log(`\n[3/4] Filtering duplicates...`);
    const newLeads = candidates
      .filter((lead) => {
        const key = lead.businessName.toLowerCase().trim();
        return key && !existingNames.has(key);
      })
      .slice(0, MAX_LEADS);

    console.log(`  ${candidates.length} fetched → ${newLeads.length} new after dedup (max ${MAX_LEADS})`);

    if (newLeads.length === 0) {
      console.log('\n  No new leads this run — all Apollo results are already in your sheet.');
      console.log('  Try again tomorrow; Apollo rotates available contacts.');
      return;
    }

    // Step 4: Append new leads to Google Sheet
    console.log(`\n[4/4] Writing ${newLeads.length} new leads to Google Sheet...`);
    try {
      await appendToSheet(newLeads);
    } catch (sheetErr) {
      await notifyError(sheetErr, 'Google Sheet write');
      console.error('  Aborting — could not write to sheet.');
      return;
    }

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    console.log(`\n✓ Done — ${newLeads.length} leads added (${elapsed}s)`);
    console.log(`  Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`);
    console.log(`${'═'.repeat(60)}\n`);

  } catch (err) {
    // Catch-all for unexpected errors
    await notifyError(err, 'Unexpected error in lead generation');
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

// Runs every day at 7:00 AM Eastern Time
// node-cron uses local system time by default; 'America/New_York' makes it explicit
cron.schedule('0 7 * * *', runLeadGeneration, {
  timezone: 'America/New_York',
  scheduled: true,
});

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--auth')) {
  // Run the Google OAuth flow only — useful for first-time setup
  console.log('Running Google Sheets authorization...');
  authorize()
    .then(() => {
      console.log('\n✓ Authorization successful. You can now run the workflow.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Authorization failed:', err.message);
      process.exit(1);
    });

} else if (args.includes('--verify')) {
  // Test both Apollo and Google Sheets connectivity without writing anything
  verifyConnections();

} else if (args.includes('--test')) {
  // Run the full workflow immediately (writes to your sheet)
  console.log('Test mode: running workflow now...');
  runLeadGeneration().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });

} else {
  // Normal mode: start the scheduler and keep the process alive
  console.log('\nApollo Lead Generation Scheduler started');
  console.log('  Runs daily at 7:00 AM Eastern Time');
  console.log('  Max leads per run:', MAX_LEADS);
  console.log('  Target sheet ID:', process.env.GOOGLE_SHEET_ID);
  console.log('\nCommands:');
  console.log('  node index.js --auth     → Complete Google OAuth (run once on setup)');
  console.log('  node index.js --verify   → Test Apollo + Sheets connectivity');
  console.log('  node index.js --test     → Run workflow now (writes to sheet)');
  console.log('\nScheduler is running. Press Ctrl+C to stop.\n');
}

// ─── Connection verification ───────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\nVerifying connections...\n');
  let apolloOk = false;
  let sheetsOk = false;

  // Test Apollo
  process.stdout.write('[Apollo.io] ');
  const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey || apiKey === 'your_apollo_api_key_here') {
      throw new Error('APOLLO_API_KEY is not set in your .env file');
    }

    // Lightweight API call: get current user profile
    const res = await (await fetch)(`https://api.apollo.io/v1/auth/health?api_key=${apiKey}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
    });
    const data = await res.json();

    if (res.ok && !data.error) {
      console.log('✓ Connected');
      console.log(`  Organization: ${data.organization?.name || 'N/A'}`);
      console.log(`  Plan: ${data.plan_type || data.subscription_tier || 'N/A'}`);
      apolloOk = true;
    } else {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
  } catch (err) {
    console.log('✗ FAILED —', err.message);
    if (err.message.includes('API_INACCESSIBLE') || err.message.includes('Free plan')) {
      console.log('  ⚠ People search API requires Apollo Basic plan ($49/mo) or higher.');
      console.log('  Upgrade at: https://www.apollo.io/pricing');
    }
  }

  // Test Google Sheets
  process.stdout.write('\n[Google Sheets] ');
  try {
    const existingNames = await getExistingBusinessNames();
    console.log('✓ Connected');
    console.log(`  Sheet ID: ${process.env.GOOGLE_SHEET_ID}`);
    console.log(`  Existing entries: ${existingNames.size}`);
    sheetsOk = true;
  } catch (err) {
    console.log('✗ FAILED —', err.message);
    if (err.message.includes('credentials.json')) {
      console.log('  See SETUP.md step 2 to download your Google OAuth credentials.');
    } else if (err.message.includes('invalid_grant') || err.message.includes('token')) {
      console.log('  Run `npm run auth` to re-authorize Google access.');
    }
  }

  console.log('\n' + '─'.repeat(40));
  if (apolloOk && sheetsOk) {
    console.log('✓ All systems connected. Safe to start the scheduler.\n');
  } else {
    console.log('✗ One or more connections failed. Fix the issues above before starting.\n');
    process.exit(1);
  }
  process.exit(0);
}
