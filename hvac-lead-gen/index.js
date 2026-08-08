'use strict';

// Load .env before anything else
require('dotenv').config();

const fs   = require('fs');
const cron = require('node-cron');

const { searchHVACPeople, enrichPeople, pickBestPhone } = require('./lib/apollo');
const { createAuthClient, getExistingBusinessNames, appendLeads, ensureHeaderRow } = require('./lib/sheets');

// ── Configuration ─────────────────────────────────────────────────────────────
const {
  APOLLO_API_KEY,
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
  GOOGLE_SPREADSHEET_ID,
  GOOGLE_SHEET_NAME   = 'Leads',
  MAX_LEADS_PER_RUN   = '25',
} = process.env;

const MAX_LEADS     = parseInt(MAX_LEADS_PER_RUN, 10);
const ENRICH_BATCH  = 10; // people enriched per Apollo API call (controls credit usage)
const SEARCH_POOL   = 100; // candidates fetched from search before enrichment filtering

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg, level = 'INFO') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  if (level === 'ERROR' || level === 'WARN') {
    fs.appendFileSync('error.log', line + '\n');
  }
}

// ── Error notification ────────────────────────────────────────────────────────
// Add Slack or email here if you want alerts beyond the console + error.log.
// Example Slack webhook (install @slack/webhook and uncomment):
//   const { IncomingWebhook } = require('@slack/webhook');
//   const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
//   await webhook.send({ text: `HVAC Lead Gen ERROR: ${message}` });
function notifyError(message) {
  log(`ALERT — ${message}`, 'ERROR');
  // Email alert placeholder — see README for setup instructions
}

// ── Core lead generation logic ────────────────────────────────────────────────
let isRunning = false;

async function runLeadGen() {
  if (isRunning) {
    log('Previous run still in progress — skipping this trigger.', 'WARN');
    return;
  }
  isRunning = true;

  try {
    log('━━━ HVAC Lead Gen — Run Starting ━━━');

    // ── Step 1: Search Apollo for candidates ──────────────────────────────────
    log(`Searching Apollo.io for HVAC decision-makers in Southwest Michigan...`);

    let candidates;
    try {
      candidates = await searchHVACPeople(APOLLO_API_KEY, SEARCH_POOL);
    } catch (err) {
      const detail = err.response?.data?.message || err.message;
      const status = err.response?.status ? ` (HTTP ${err.response.status})` : '';
      throw new Error(`Apollo search failed${status}: ${detail}`);
    }

    if (!candidates.length) {
      const msg = 'Apollo returned 0 results. Check your API key and search filters.';
      log(msg, 'WARN');
      notifyError(msg);
      return;
    }

    log(`Found ${candidates.length} candidate(s) from Apollo search.`);

    // ── Step 2: Enrich candidates in batches to get phone numbers ─────────────
    // We cap total enrichment at 5 × ENRICH_BATCH (50 people) to control credit use.
    // Each enriched person costs 1 Apollo credit.
    const enrichLimit  = Math.min(candidates.length, ENRICH_BATCH * 5);
    const enriched     = [];

    log(`Enriching up to ${enrichLimit} candidates for phone numbers...`);

    for (let i = 0; i < enrichLimit; i += ENRICH_BATCH) {
      const batch = candidates.slice(i, i + ENRICH_BATCH);
      const ids   = batch.map(p => p.id).filter(Boolean);

      try {
        const results = await enrichPeople(APOLLO_API_KEY, ids);
        enriched.push(...results);
        log(`  Batch ${Math.floor(i / ENRICH_BATCH) + 1}: enriched ${results.length} person(s)`);
      } catch (err) {
        log(`  Batch ${Math.floor(i / ENRICH_BATCH) + 1} failed — ${err.message}`, 'WARN');
      }

      // Short pause between batches to respect Apollo rate limits
      if (i + ENRICH_BATCH < enrichLimit) {
        await sleep(600);
      }

      // Early stop: we already have more than enough contacts with phones
      const phonesFound = enriched.filter(p => p.phone_numbers?.length).length;
      if (phonesFound >= MAX_LEADS * 2) {
        log(`  Got ${phonesFound} contacts with phones — stopping enrichment early.`);
        break;
      }
    }

    const withPhones = enriched.filter(p => p.phone_numbers?.length);
    log(`${withPhones.length}/${enriched.length} enriched contacts have phone numbers.`);

    if (!withPhones.length) {
      const msg = 'No enriched contacts had phone numbers. Apollo plan may not include phone reveal.';
      log(msg, 'WARN');
      notifyError(msg);
      return;
    }

    // ── Step 3: Connect to Google Sheets ──────────────────────────────────────
    log('Connecting to Google Sheets...');
    let auth;
    try {
      auth = createAuthClient(GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
      await ensureHeaderRow(auth, GOOGLE_SPREADSHEET_ID, GOOGLE_SHEET_NAME);
    } catch (err) {
      throw new Error(`Google Sheets auth failed: ${err.message}`);
    }

    let existingNames;
    try {
      existingNames = await getExistingBusinessNames(auth, GOOGLE_SPREADSHEET_ID, GOOGLE_SHEET_NAME);
      log(`Sheet already contains ${existingNames.size} business(es) — skipping any matches.`);
    } catch (err) {
      throw new Error(`Failed to read existing leads from sheet: ${err.message}`);
    }

    // ── Step 4: Build new lead list, deduplicating against the sheet ──────────
    const newLeads     = [];
    const skippedDupes = [];

    for (const person of withPhones) {
      if (newLeads.length >= MAX_LEADS) break;

      const businessName = person.organization?.name?.trim();
      if (!businessName) continue;

      const key = businessName.toLowerCase();
      if (existingNames.has(key)) {
        skippedDupes.push(businessName);
        continue;
      }

      const phone = pickBestPhone(person.phone_numbers);
      if (!phone) continue;

      newLeads.push({
        businessName,
        firstName:   person.first_name || '',
        lastName:    person.last_name  || '',
        phoneNumber: phone,
        city:        person.city || person.organization?.city || '',
        website:     person.organization?.website_url || '',
      });

      // Add to the in-memory set so duplicates within this run are also caught
      existingNames.add(key);
    }

    if (skippedDupes.length) {
      log(`Skipped ${skippedDupes.length} duplicate(s): ${skippedDupes.slice(0, 5).join(', ')}${skippedDupes.length > 5 ? '…' : ''}`);
    }

    // ── Step 5: Write new leads to Google Sheet ───────────────────────────────
    if (!newLeads.length) {
      log('No new unique leads to add this run.', 'INFO');
      log('━━━ Run Complete (0 leads added) ━━━');
      return;
    }

    try {
      const added = await appendLeads(auth, GOOGLE_SPREADSHEET_ID, newLeads, GOOGLE_SHEET_NAME);
      log(`✓ Added ${added} new lead(s) to "${GOOGLE_SHEET_NAME}".`, 'INFO');
    } catch (err) {
      throw new Error(`Google Sheets write failed: ${err.message}`);
    }

    log('━━━ Run Complete ━━━');

  } catch (err) {
    notifyError(err.message);
    log(err.stack || err.message, 'ERROR');
  } finally {
    isRunning = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Configuration validation ──────────────────────────────────────────────────
function validateConfig() {
  const required = {
    APOLLO_API_KEY:                   'Apollo.io API key',
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH:  'Google service account JSON key path',
    GOOGLE_SPREADSHEET_ID:            'Google Spreadsheet ID',
  };

  const missing = Object.entries(required)
    .filter(([k]) => !process.env[k])
    .map(([, label]) => label);

  if (missing.length) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(m => console.error(`   • ${m}`));
    console.error('\nCopy .env.example → .env and fill in the values.\n');
    process.exit(1);
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
validateConfig();

// Schedule: 7:00 AM Eastern Time, every day including weekends.
// Change the cron expression if you want weekdays only: '0 7 * * 1-5'
cron.schedule('0 7 * * *', runLeadGen, { timezone: 'America/New_York' });

log('HVAC Lead Gen scheduler started.');
log(`Next run: 7:00 AM ET. Max leads/run: ${MAX_LEADS}. Sheet tab: "${GOOGLE_SHEET_NAME}".`);
log('Run "npm run setup" first to verify connections.');

// --run-now flag: run immediately in addition to scheduling (useful for first-run testing)
if (process.argv.includes('--run-now')) {
  log('--run-now flag detected — starting an immediate run.');
  runLeadGen();
}
