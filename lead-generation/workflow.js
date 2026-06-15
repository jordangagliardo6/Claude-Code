/**
 * workflow.js — Core lead generation pipeline
 *
 * Orchestrates:
 *   1. Fetch leads from Apollo (HVAC owners, SW Michigan, ≤25 employees)
 *   2. Read existing business names from Google Sheet to detect duplicates
 *   3. Filter out duplicates and leads without phone numbers
 *   4. Append new leads to the sheet (max MAX_LEADS_PER_RUN per run)
 *
 * This file is what gets called by the scheduler (index.js).
 * It can also be run manually: `node workflow.js`
 */

'use strict';

require('dotenv').config();

const { fetchLeads } = require('./apollo');
const { getExistingBusinessNames, ensureHeader, appendRows } = require('./sheets');
const { sendErrorAlert } = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

/**
 * Format today's date as MM/DD/YYYY (Eastern Time).
 */
function todayET() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
}

/**
 * Convert a lead object into a spreadsheet row array.
 * Column order must match the header in sheets.js:
 *   A: Date Added | B: Business Name | C: First Name | D: Last Name
 *   E: Phone | F: City | G: Website | H: Called (blank) | I: Notes (blank)
 */
function leadToRow(lead) {
  return [
    todayET(),          // A - Date Added
    lead.businessName,  // B - Business Name
    lead.firstName,     // C - Owner First Name
    lead.lastName,      // D - Owner Last Name
    lead.phone,         // E - Phone Number
    lead.city,          // F - City
    lead.website,       // G - Website
    '',                 // H - Called (fill in manually)
    '',                 // I - Notes (fill in manually)
  ];
}

/**
 * Run the full lead generation workflow.
 * Returns a summary object with counts and any error info.
 */
async function run() {
  const startedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Lead Gen Run — ${startedAt} ET`);
  console.log('─'.repeat(60));

  let fetched = 0;
  let duplicates = 0;
  let added = 0;

  try {
    // ── Step 1: Ensure spreadsheet has a header row ─────────────────────────
    console.log('Checking spreadsheet header…');
    await ensureHeader();

    // ── Step 2: Read existing business names to skip duplicates ─────────────
    console.log('Reading existing leads from Google Sheet…');
    const existingNames = await getExistingBusinessNames();
    console.log(`  Found ${existingNames.size} existing entries.`);

    // ── Step 3: Fetch new leads from Apollo ──────────────────────────────────
    console.log(`Searching Apollo for HVAC leads (max ${MAX_LEADS})…`);
    const leads = await fetchLeads(MAX_LEADS * 2); // fetch extra to absorb duplicates
    fetched = leads.length;
    console.log(`  Apollo returned ${fetched} leads with phone numbers.`);

    if (fetched === 0) {
      const msg =
        'Apollo returned 0 leads with phone numbers for the current filters.\n' +
        'Possible causes:\n' +
        '  • API key is invalid or expired\n' +
        '  • No matching contacts in the Apollo database for SW Michigan HVAC\n' +
        '  • Phone numbers require enrichment (credits) on your Apollo plan\n' +
        '  • Rate limit hit — try again later';
      console.warn('⚠️  ' + msg);
      await sendErrorAlert('0 leads returned by Apollo', msg);
      return { fetched: 0, duplicates: 0, added: 0 };
    }

    // ── Step 4: Deduplicate ──────────────────────────────────────────────────
    const newLeads = leads.filter((lead) => {
      const isDuplicate = existingNames.has(lead.businessName.toLowerCase());
      if (isDuplicate) duplicates++;
      return !isDuplicate;
    });

    console.log(`  Skipping ${duplicates} duplicate(s) already in the sheet.`);

    // ── Step 5: Cap at MAX_LEADS and write to sheet ──────────────────────────
    const toAdd = newLeads.slice(0, MAX_LEADS);
    added = toAdd.length;

    if (toAdd.length === 0) {
      console.log('  No new leads to add this run.');
      return { fetched, duplicates, added: 0 };
    }

    console.log(`Adding ${added} new lead(s) to Google Sheet…`);
    const rows = toAdd.map(leadToRow);
    await appendRows(rows);

    // ── Step 6: Print summary ────────────────────────────────────────────────
    console.log('\n✅ Done!');
    console.log(`   Fetched from Apollo : ${fetched}`);
    console.log(`   Duplicates skipped  : ${duplicates}`);
    console.log(`   New leads added     : ${added}`);

    if (toAdd.length > 0) {
      console.log('\nLeads added this run:');
      toAdd.forEach((lead, i) => {
        console.log(
          `  ${i + 1}. ${lead.businessName} | ${lead.firstName} ${lead.lastName} | ${lead.phone} | ${lead.city}`
        );
      });
    }

    return { fetched, duplicates, added };
  } catch (err) {
    const errorMsg = `${err.message}\n\nStack:\n${err.stack}`;
    console.error('\n❌ Workflow error:', err.message);

    let alertSubject = 'Workflow error';
    if (err.response?.status === 401) alertSubject = 'Apollo API key invalid (401)';
    else if (err.response?.status === 429) alertSubject = 'Apollo rate limit hit (429)';
    else if (err.message.includes('credentials.json')) alertSubject = 'Google credentials missing';
    else if (err.message.includes('token.json')) alertSubject = 'Google OAuth token missing — run setup';
    else if (err.message.includes('SPREADSHEET_ID')) alertSubject = 'Google Spreadsheet ID not set';

    try {
      await sendErrorAlert(alertSubject, errorMsg);
    } catch (notifyErr) {
      console.error('  Could not send alert email:', notifyErr.message);
    }

    return { fetched, duplicates, added, error: err.message };
  }
}

// Allow running this file directly: `node workflow.js`
if (require.main === module) {
  run().then((result) => {
    process.exit(result.error ? 1 : 0);
  });
}

module.exports = { run };
