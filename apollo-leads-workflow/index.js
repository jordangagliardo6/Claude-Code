/**
 * SW Michigan HVAC Lead Generation — Apollo.io → Google Sheets
 *
 * Usage:
 *   node index.js            Start the daily 7am ET scheduler
 *   node index.js --verify   Test API connections without adding any leads
 *   node index.js --test     Run one full cycle immediately (adds real leads)
 *
 * Required env vars (set in .env or your shell before running):
 *   APOLLO_API_KEY           Your Apollo.io API key
 *   GOOGLE_CREDENTIALS_PATH  Path to your service account JSON file
 *                            OR
 *   GOOGLE_CREDENTIALS_JSON  Raw JSON string of service account credentials
 *
 * Optional:
 *   SPREADSHEET_ID           Override the default target spreadsheet
 *   SHEET_TAB                Override the default sheet tab name (default: Sheet1)
 */

require('dotenv').config();
const cron = require('node-cron');

const config = require('./config');
const { searchPeople, enrichPeople, extractPhone, verifyCredentials } = require('./apollo');
const { getExistingBusinessNames, appendLeads, verifyAccess } = require('./sheets');

// ─── Core workflow ─────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ── Starting HVAC lead generation run ──`);

  const { SPREADSHEET_ID, SHEET_TAB, MAX_LEADS_PER_RUN } = config;

  // Step 1: Load existing business names from the sheet (for deduplication)
  console.log('Step 1: Reading existing leads from Google Sheet...');
  const existingNames = await getExistingBusinessNames(SPREADSHEET_ID, SHEET_TAB);
  console.log(`  ${existingNames.size} existing businesses found`);

  // Step 2: Search Apollo for HVAC owners in SW Michigan
  console.log('Step 2: Searching Apollo.io for HVAC contacts...');
  const { people, pagination } = await searchPeople();

  if (!people.length) {
    console.log('  Apollo returned 0 results — nothing to add this run.');
    logError('Apollo returned 0 results. Filters may be too narrow or API limit reached.');
    return 0;
  }
  console.log(`  ${people.length} candidates found (${pagination.total_entries ?? '?'} total in Apollo)`);

  // Step 3: Separate people who already have phones from those that need enrichment
  const withPhone = [];
  const needsEnrichment = [];

  for (const person of people) {
    const phone = extractPhone(person);
    if (phone) {
      withPhone.push({ ...person, _phone: phone });
    } else {
      needsEnrichment.push(person);
    }
  }
  console.log(`  ${withPhone.length} already have a phone number, ${needsEnrichment.length} need enrichment`);

  // Step 4: Enrich contacts that are missing phone numbers (uses Apollo credits)
  if (needsEnrichment.length) {
    console.log(`Step 4: Enriching ${needsEnrichment.length} contacts to reveal phone numbers...`);
    const enriched = await enrichPeople(needsEnrichment.map(p => p.id));

    for (const enrichedPerson of enriched) {
      const phone = extractPhone(enrichedPerson);
      if (phone) {
        withPhone.push({ ...enrichedPerson, _phone: phone });
      }
      // Silently drop contacts still missing a phone — per requirement
    }
    console.log(`  After enrichment: ${withPhone.length} contacts have a phone number`);
  }

  // Step 5: Deduplicate against existing sheet entries
  const newLeads = withPhone.filter(p => {
    const bizName = (p.organization_name || '').toLowerCase().trim();
    return bizName && !existingNames.has(bizName);
  });
  console.log(`Step 5: ${newLeads.length} new leads after deduplication`);

  if (!newLeads.length) {
    console.log('  All candidates already exist in the sheet — nothing to add.');
    return 0;
  }

  // Step 6: Sort by title priority and take up to MAX_LEADS_PER_RUN
  const TITLE_PRIORITY = ['owner', 'president', 'founder', 'co-founder', 'co founder', 'general manager'];
  newLeads.sort((a, b) => {
    const aRank = TITLE_PRIORITY.findIndex(t => (a.title || '').toLowerCase().includes(t));
    const bRank = TITLE_PRIORITY.findIndex(t => (b.title || '').toLowerCase().includes(t));
    return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
  });
  const leadsToAdd = newLeads.slice(0, MAX_LEADS_PER_RUN);
  console.log(`Step 6: Adding ${leadsToAdd.length} leads (capped at ${MAX_LEADS_PER_RUN} per run)`);

  // Step 7: Format rows and append to Google Sheets
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  const rows = leadsToAdd.map(p => [
    today,                                      // Date Added
    (p.organization_name || '').trim(),         // Business Name
    (p.first_name || '').trim(),                // Owner First Name
    (p.last_name || '').trim(),                 // Owner Last Name
    p._phone,                                   // Phone Number
    (p.city || '').trim(),                      // City
    (p.organization?.website_url || '').trim(), // Website
    '',                                         // Called (user fills in)
    '',                                         // Notes (user fills in)
  ]);

  await appendLeads(SPREADSHEET_ID, SHEET_TAB, rows);

  console.log(`\n✓ Run complete — ${rows.length} new HVAC leads added to sheet.`);
  console.log(`  Spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  return rows.length;
}

// ─── Error logger ──────────────────────────────────────────────────────────────

function logError(message) {
  // Logs to console (visible in PM2 / nohup logs, Docker logs, etc.)
  // Replace or extend this with email / Slack / PagerDuty as needed.
  const timestamp = new Date().toISOString();
  const separator = '─'.repeat(60);
  console.error(`\n${separator}`);
  console.error(`[${timestamp}] LEAD GEN ERROR`);
  console.error(message);
  console.error(`${separator}\n`);
  console.error(`Notification email: jgagliardo98@gmail.com`);
  console.error(`Action required: check Apollo quota, Google Sheets access, and env vars.`);
}

// ─── Connection verification ────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n── Verifying API connections ──\n');

  // Apollo
  process.stdout.write('Apollo.io ... ');
  try {
    await verifyCredentials();
    console.log('✓ Connected');
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`  Error: ${err.response?.data?.error || err.message}`);
    return false;
  }

  // Google Sheets
  process.stdout.write('Google Sheets ... ');
  try {
    await verifyAccess(config.SPREADSHEET_ID, config.SHEET_TAB);
    console.log('✓ Connected');
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`  Error: ${err.message}`);
    return false;
  }

  console.log('\n✓ Both APIs connected. Safe to start the scheduler.\n');
  return true;
}

// ─── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  // Just check connections and exit
  verifyConnections()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => { console.error(err); process.exit(1); });

} else if (args.includes('--test')) {
  // Run one full cycle immediately, then exit
  console.log('Running in TEST mode — will add real leads if found.\n');
  verifyConnections()
    .then(ok => {
      if (!ok) process.exit(1);
      return runLeadGeneration();
    })
    .then(count => {
      console.log(`\nTest run finished. ${count} leads added.`);
      process.exit(0);
    })
    .catch(err => {
      logError(err.message);
      process.exit(1);
    });

} else {
  // Normal mode: verify connections first, then start the scheduler
  verifyConnections()
    .then(ok => {
      if (!ok) {
        console.error('Startup aborted — fix the connection errors above, then restart.');
        process.exit(1);
      }

      // Runs at 7:00 AM Eastern Time every day
      // node-cron uses server local time; timezone option overrides it
      cron.schedule(
        '0 7 * * *',
        () => {
          runLeadGeneration().catch(err => logError(err.message));
        },
        { timezone: 'America/New_York' }
      );

      console.log('Scheduler started.');
      console.log('Leads will be pulled daily at 7:00 AM Eastern Time.');
      console.log(`Target sheet: https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}/edit`);
      console.log('Press Ctrl+C to stop.\n');
    })
    .catch(err => {
      logError(err.message);
      process.exit(1);
    });
}
