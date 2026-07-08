/**
 * index.js — Apollo.io → Google Sheets lead generation scheduler
 *
 * Runs automatically every morning at 7:00 AM Eastern Time via node-cron.
 * Also exports runLeadGen() so you can call it directly (e.g., from setup.js).
 *
 * Usage:
 *   node index.js          — starts the scheduler (keeps running)
 *   node index.js --now    — run once immediately, then exit
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');

const { searchLeads, enrichContact, extractBestPhone, extractCity } = require('./lib/apollo');
const { getAuthClient, getExistingBusinessNames, appendLeads }       = require('./lib/sheets');
const { sendErrorNotification }                                       = require('./lib/notify');

// ─── Config ───────────────────────────────────────────────────────────────────

// Maximum new leads to add per run. Keep it small so you're not overwhelmed.
// Override with MAX_LEADS_PER_RUN in .env.
const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN, 10) || 25;

// We fetch more than MAX_LEADS upfront to account for contacts without phones.
// E.g., if 40% of Apollo contacts lack a phone number, fetching 75 yields ~45
// enrichable contacts, giving us plenty to hit 25 with phones.
const SEARCH_BUFFER_MULTIPLIER = 3;

// Delay between Apollo enrichment calls (ms). Keeps us under Apollo's rate limits.
const ENRICH_DELAY_MS = 600;

// ─── Main workflow ────────────────────────────────────────────────────────────

/**
 * Full lead generation run:
 *   1. Load existing business names from the sheet (for duplicate detection)
 *   2. Search Apollo for matching contacts (no phones yet)
 *   3. Skip contacts whose company is already in the sheet
 *   4. Enrich remaining contacts one-by-one to get phone numbers
 *   5. Keep only contacts with a phone number
 *   6. Append up to MAX_LEADS new leads to the sheet
 */
async function runLeadGen() {
  const started = new Date();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${started.toISOString()}] Lead gen run starting…`);
  console.log(`Max leads this run: ${MAX_LEADS}`);

  try {
    // ── Step 1: Connect to Google Sheets ──────────────────────────────────────
    console.log('\n[1/5] Connecting to Google Sheets…');
    const auth          = await getAuthClient();
    const existingNames = await getExistingBusinessNames(auth);
    console.log(`      ${existingNames.size} existing businesses already in sheet.`);

    // ── Step 2: Search Apollo ─────────────────────────────────────────────────
    const fetchCount = MAX_LEADS * SEARCH_BUFFER_MULTIPLIER;
    console.log(`\n[2/5] Searching Apollo for up to ${fetchCount} contacts…`);

    const rawPeople = await searchLeads(Math.min(fetchCount, 100));
    console.log(`      Apollo returned ${rawPeople.length} result(s).`);

    if (!rawPeople.length) {
      throw new Error(
        'Apollo returned 0 results. Check your APOLLO_API_KEY and search filters.'
      );
    }

    // ── Step 3: Filter out existing businesses ────────────────────────────────
    console.log('\n[3/5] Filtering out businesses already in sheet…');
    const newPeople = rawPeople.filter(p => {
      const orgName = (p.organization?.name || '').trim().toLowerCase();
      return orgName && !existingNames.has(orgName);
    });
    console.log(`      ${newPeople.length} new (not yet in sheet) after duplicate filter.`);

    if (!newPeople.length) {
      console.log('      Nothing new to add. Run complete.');
      return { added: 0, skipped: rawPeople.length };
    }

    // ── Step 4: Enrich contacts to get phone numbers ──────────────────────────
    console.log(`\n[4/5] Enriching contacts for phone numbers (max ${MAX_LEADS} enrichment credits)…`);
    const enrichedLeads = [];

    for (const person of newPeople) {
      if (enrichedLeads.length >= MAX_LEADS) break;

      process.stdout.write(`      Enriching "${person.first_name} ${person.last_name}" `
        + `at "${person.organization?.name}"… `);

      const enriched = await enrichContact(person.id);
      const phone    = extractBestPhone(enriched);

      if (!phone) {
        process.stdout.write('no phone — skipped\n');
        continue;
      }

      process.stdout.write(`✓ ${phone}\n`);

      enrichedLeads.push({
        businessName: (enriched.organization?.name || person.organization?.name || '').trim(),
        firstName:    (enriched.first_name || person.first_name || '').trim(),
        lastName:     (enriched.last_name  || person.last_name  || '').trim(),
        phone,
        city:         extractCity(enriched) || extractCity(person),
        website:      (enriched.organization?.website_url || person.organization?.website_url || '').trim(),
      });

      // Rate-limit pause between enrichment API calls.
      if (enrichedLeads.length < MAX_LEADS) {
        await delay(ENRICH_DELAY_MS);
      }
    }

    console.log(`\n      ${enrichedLeads.length} lead(s) have a phone number.`);

    if (!enrichedLeads.length) {
      console.log('      No leads with phone numbers found this run.');
      return { added: 0, skipped: newPeople.length };
    }

    // ── Step 5: Append to Google Sheets ──────────────────────────────────────
    console.log(`\n[5/5] Appending ${enrichedLeads.length} lead(s) to Google Sheet…`);
    const written = await appendLeads(auth, enrichedLeads);

    const elapsed = ((Date.now() - started.getTime()) / 1000).toFixed(1);
    console.log(`\n✓ Done — ${written} new lead(s) added in ${elapsed}s.`);
    console.log(`  Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`);

    return { added: written, skipped: rawPeople.length - written };

  } catch (err) {
    const message = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;

    console.error('\n✗ Run failed:', message);

    await sendErrorNotification(
      'Lead generation run failed',
      `Error: ${message}\n\nStack:\n${err.stack || 'N/A'}`
    );

    return { added: 0, error: message };
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--now');

if (runNow) {
  // One-shot mode: run immediately and exit.
  runLeadGen().then(result => {
    console.log('\nResult:', result);
    process.exit(result.error ? 1 : 0);
  });
} else {
  // Scheduler mode: run at 7:00 AM Eastern every day, then stay alive.
  // node-cron uses the 'America/New_York' timezone, which automatically
  // handles EST (UTC-5) and EDT (UTC-4) daylight savings transitions.
  const schedule = '0 7 * * *';

  console.log('Apollo Lead Gen scheduler started.');
  console.log('Scheduled to run daily at 7:00 AM Eastern (America/New_York).');
  console.log('Press Ctrl+C to stop.\n');

  cron.schedule(schedule, runLeadGen, {
    scheduled: true,
    timezone: 'America/New_York',
  });

  // Show the next scheduled run time.
  const now  = new Date();
  const next = new Date(now);
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  console.log(`Next run: ${next.toLocaleString('en-US', { timeZone: 'America/New_York' })} Eastern`);
}

module.exports = { runLeadGen };
