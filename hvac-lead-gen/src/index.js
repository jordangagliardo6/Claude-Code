'use strict';

/**
 * HVAC Lead Generation — Main Entry Point
 *
 * Schedules a daily 7 AM ET run that:
 *   1. Searches Apollo.io for HVAC owner/decision-maker contacts in SW Michigan
 *   2. Enriches results to unlock phone numbers
 *   3. Filters out duplicates already in the Google Sheet
 *   4. Appends up to MAX_LEADS_PER_RUN new rows
 *   5. Sends an error email if anything fails
 *
 * Usage:
 *   npm start          — verify connections, then start the daily scheduler
 *   npm run verify     — test API connections and exit (no scheduling)
 *   npm run run-now    — verify connections, run immediately, then stay scheduled
 */

require('dotenv').config();

const cron = require('node-cron');
const axios = require('axios');

const config = require('./config');
const { searchPeople, enrichForPhones, toRow } = require('./apollo');
const { getExistingNames, ensureHeaders, appendRows } = require('./sheets');
const { notifyError } = require('./notify');

// ─── Core run logic ───────────────────────────────────────────────────────────

async function runLeadGen() {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`HVAC Lead Gen Run  —  ${timestamp} ET`);
  console.log('═'.repeat(60));

  try {
    // ── 1. Search Apollo for candidates ──────────────────────────────────────
    console.log('\n1. Searching Apollo.io across SW Michigan cities...');
    const candidates = await searchPeople();
    console.log(`   Total unique candidates: ${candidates.length}`);

    if (candidates.length === 0) {
      await notifyError(
        'Apollo Returned No Results',
        'The people search returned 0 results. Possible causes:\n' +
        '  • Invalid or expired APOLLO_API_KEY\n' +
        '  • Apollo plan does not support people search\n' +
        '  • Industry keywords returned no matches for these cities'
      );
      return;
    }

    // ── 2. Enrich for phone numbers ───────────────────────────────────────────
    // Only enrich enough to fill the quota (with buffer for filtering)
    const enrichBuffer = Math.min(candidates.length, config.MAX_LEADS_PER_RUN * 2);
    console.log(`\n2. Enriching ${enrichBuffer} contacts for phone numbers...`);
    console.log(`   (costs ~${enrichBuffer} Apollo export credits)`);
    const enriched = await enrichForPhones(candidates.slice(0, enrichBuffer));
    console.log(`   Enrichment complete: ${enriched.length} records`);

    // ── 3. Map and filter: must have a phone and a business name ─────────────
    const today = new Date().toLocaleDateString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
    });

    const withPhone = enriched
      .map(p => toRow(p, today))
      .filter(r => r.phone && r.businessName);

    console.log(`\n3. Contacts with phone number: ${withPhone.length}`);

    if (withPhone.length === 0) {
      await notifyError(
        'No Contacts With Phone Numbers',
        'Enrichment returned results but none had a phone number.\n' +
        'Check if your Apollo plan includes phone reveals, or upgrade to Basic ($49/mo).'
      );
      return;
    }

    // ── 4. Deduplicate against existing sheet rows ────────────────────────────
    console.log('\n4. Checking for duplicates in Google Sheet...');
    await ensureHeaders(config.SHEET_TAB, config.SHEET_COLUMNS);
    const existingNames = await getExistingNames(config.SHEET_TAB);
    console.log(`   Existing entries in sheet: ${existingNames.size}`);

    const newLeads = withPhone
      .filter(r => !existingNames.has(r.businessName.toLowerCase().trim()))
      .slice(0, config.MAX_LEADS_PER_RUN);

    console.log(`   New (non-duplicate) leads: ${newLeads.length}`);

    if (newLeads.length === 0) {
      console.log('\n   All results are already in the sheet. Nothing to add.');
      console.log('   Consider expanding TARGET_CITIES or INDUSTRY_KEYWORDS in config.js.');
      return;
    }

    // ── 5. Append to Google Sheets ────────────────────────────────────────────
    console.log(`\n5. Appending ${newLeads.length} leads to Google Sheets tab "${config.SHEET_TAB}"...`);
    const added = await appendRows(config.SHEET_TAB, newLeads);

    // Summary
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Run complete — ${added} new lead(s) added`);
    console.log('─'.repeat(60));
    newLeads.forEach((l, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${l.businessName.padEnd(35)} ${l.firstName} ${l.lastName}`);
      console.log(`       ${l.phone.padEnd(18)} ${l.city}`);
    });
    console.log('');

  } catch (err) {
    const detail = err.stack || err.message || String(err);
    await notifyError('Run Failed With Unexpected Error', detail);
  }
}

// ─── Connection verification ──────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n═══════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Check');
  console.log('═══════════════════════════════════════\n');

  let allOk = true;

  // Apollo check — do a minimal 1-result search to confirm auth
  try {
    const { data } = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        per_page: 1,
        person_titles: ['owner'],
        organization_locations: ['Michigan, United States'],
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const total = data.pagination?.total_entries ?? '?';
    console.log(`  Apollo.io        ✓  (auth OK — ${total} total prospects available for test query)`);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(`  Apollo.io        ✗  ${msg}`);
    if (!process.env.APOLLO_API_KEY) {
      console.error('                      APOLLO_API_KEY is not set in your .env file');
    }
    allOk = false;
  }

  // Google Sheets check — attempt to read/write the header row
  try {
    await ensureHeaders(config.SHEET_TAB, config.SHEET_COLUMNS);
    const sheetId = process.env.GOOGLE_SHEET_ID || '(not set)';
    console.log(`  Google Sheets    ✓  (connected — sheet ID: ${sheetId})`);
  } catch (err) {
    console.error(`  Google Sheets    ✗  ${err.message}`);
    allOk = false;
  }

  console.log('');
  return allOk;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify-only');
  const runNow = args.includes('--run-now');

  const ok = await verifyConnections();

  if (!ok) {
    console.error('Fix the errors above before starting.\n');
    console.error('See SETUP.md for step-by-step instructions.\n');
    process.exit(1);
  }

  if (verifyOnly) {
    console.log('Verification passed. Exiting (--verify-only mode).\n');
    return;
  }

  // Register the daily cron job
  cron.schedule(config.CRON_SCHEDULE, runLeadGen, {
    timezone: config.CRON_TIMEZONE,
  });

  console.log(`Scheduler running. Next execution: 7:00 AM Eastern Time.`);
  console.log(`Tip: run  npm run run-now  to trigger immediately.\n`);

  // Kick off an immediate run if requested
  if (runNow) {
    console.log('--run-now flag detected — starting first run now...\n');
    await runLeadGen();
  }
})();
