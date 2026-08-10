/**
 * index.js — HVAC Lead Generator
 *
 * Searches Apollo.io for HVAC company owners in Southwest Michigan,
 * deduplicates against your Google Sheet, and appends new leads daily.
 *
 * Runs on a cron schedule: 7:00 AM Eastern every morning.
 *
 * Quick start:
 *   cp .env.example .env   # fill in your API keys
 *   npm install
 *   npm run test-connection   # verify both APIs work
 *   npm start                 # start the scheduler
 */

'use strict';
require('dotenv').config();
const cron = require('node-cron');
const { searchHVACLeads, testApolloConnection } = require('./apollo');
const { getExistingBusinessNames, appendLeads, testSheetsConnection } = require('./sheets');

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
// Edit CITIES to add, remove, or change target locations.
// Each string should be "City, State" — Apollo matches against company HQ addresses.
const CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

const MAX_LEADS_PER_RUN = 25;     // max new leads to add each morning
const CRON_SCHEDULE = '0 7 * * *'; // 7:00 AM every day
const TIMEZONE = 'America/New_York';
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main lead generation function.
 * Called by the cron scheduler and also on startup.
 */
async function runLeadGeneration() {
  const runDate = new Date().toLocaleDateString('en-US', { timeZone: TIMEZONE });
  const timestamp = new Date().toISOString();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${timestamp}] Starting HVAC lead generation run`);
  console.log(`  Target: Southwest Michigan | Max leads: ${MAX_LEADS_PER_RUN}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // Step 1: Pull leads from Apollo
    const apolloLeads = await searchHVACLeads(CITIES, MAX_LEADS_PER_RUN);

    if (apolloLeads.length === 0) {
      console.log('[WARN] Apollo returned 0 leads with phone numbers.');
      console.log('       Possible causes:');
      console.log('       • Apollo free plan — upgrade to Basic for API search access');
      console.log('       • No new contacts match the current filters');
      console.log('       • API key invalid or expired');
      return;
    }

    // Step 2: Get existing business names from the sheet
    const existingNames = await getExistingBusinessNames();
    console.log(`\n  Duplicate check: ${existingNames.size} existing businesses in sheet.`);

    // Step 3: Filter out any businesses already in the sheet
    const newLeads = apolloLeads.filter(
      (lead) => !existingNames.has(lead.businessName.toLowerCase().trim())
    );

    const dupeCount = apolloLeads.length - newLeads.length;
    if (dupeCount > 0) {
      console.log(`  Skipped ${dupeCount} duplicate(s) already in the sheet.`);
    }

    if (newLeads.length === 0) {
      console.log('  No new leads to add — all results already in sheet.');
      console.log('  Consider expanding CITIES or waiting for tomorrow\'s run.');
      return;
    }

    // Step 4: Build rows for Google Sheets (columns A–I)
    const rows = newLeads.map((lead) => [
      runDate,               // A: Date Added
      lead.businessName,     // B: Business Name
      lead.firstName,        // C: Owner First Name
      lead.lastName,         // D: Owner Last Name
      lead.phone,            // E: Phone Number
      lead.city,             // F: City
      lead.website || '',    // G: Website
      '',                    // H: Called (left blank for you to fill in)
      '',                    // I: Notes (left blank for you to fill in)
    ]);

    // Step 5: Append to Google Sheets
    await appendLeads(rows);

    console.log(`\n✅ Done! ${rows.length} new lead(s) added to Google Sheets.`);
    newLeads.forEach((lead, i) => {
      console.log(
        `   ${i + 1}. ${lead.businessName} — ${lead.firstName} ${lead.lastName} — ${lead.phone} (${lead.city})`
      );
    });
  } catch (err) {
    // Log full error details for manual debugging
    console.error(`\n[ERROR] Lead generation failed: ${err.message}`);
    console.error(err.stack);
    // To add email alerting, install nodemailer and call sendErrorEmail(err) here.
    // Example with nodemailer (not included to keep dependencies minimal):
    //   const nodemailer = require('nodemailer');
    //   const transporter = nodemailer.createTransport({ service: 'gmail', auth: {...} });
    //   await transporter.sendMail({ from: ..., to: 'jgagliardo98@gmail.com', subject: 'Lead gen error', text: err.message });
  }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

if (process.argv.includes('--test')) {
  // Connection test mode — does not run the full workflow or spend credits
  (async () => {
    console.log('\n─── CONNECTION TEST ─────────────────────────────────────────');
    console.log('Checking Apollo.io...');
    const apolloOk = await testApolloConnection();

    console.log('\nChecking Google Sheets...');
    const sheetsOk = await testSheetsConnection();

    console.log('\n─── RESULT ──────────────────────────────────────────────────');
    console.log(`  Apollo.io:     ${apolloOk ? '✅ Connected' : '❌ Failed'}`);
    console.log(`  Google Sheets: ${sheetsOk ? '✅ Connected' : '❌ Failed'}`);

    if (apolloOk && sheetsOk) {
      console.log('\n🟢 Both connections OK. Run "npm start" to start the scheduler.\n');
    } else {
      console.log('\n🔴 Fix the issue(s) above before starting. See SETUP.md.\n');
      process.exit(1);
    }
  })();
} else {
  // Scheduler mode — runs once now, then every morning at 7am ET
  console.log(`\nHVAC Lead Generator — Southwest Michigan`);
  console.log(`Scheduler: ${CRON_SCHEDULE} (${TIMEZONE}) = every day at 7:00 AM Eastern`);
  console.log(`Max leads per run: ${MAX_LEADS_PER_RUN}`);
  console.log(`\nRunning initial check now...\n`);

  // Run once immediately on startup
  runLeadGeneration();

  // Then repeat on schedule
  cron.schedule(CRON_SCHEDULE, runLeadGeneration, { timezone: TIMEZONE });
}
