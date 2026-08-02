/**
 * index.js — HVAC Lead Generation Workflow
 *
 * Runs every morning at 7:00 AM Eastern Time.
 * Pulls up to 25 new HVAC owner contacts from Apollo.io in SW Michigan
 * and appends them to your Google Sheet (skipping duplicates).
 *
 * Usage:
 *   node index.js          — start the scheduler (keeps running)
 *   node index.js --now    — run one pull immediately, then exit
 */

require('dotenv').config();

const cron = require('node-cron');
const {
  searchHVACPeople,
  enrichPerson,
  extractPhone,
  isInSWMichigan,
  pickBestContactPerCompany,
  sleep,
} = require('./apollo');
const { getExistingBusinessNames, appendLeads } = require('./sheets');
const { sendAlert } = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || 'America/New_York';

// ── Main pull function ────────────────────────────────────────────────────────

async function runLeadPull() {
  const runStart = new Date();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`HVAC Lead Pull started: ${runStart.toISOString()}`);
  console.log('='.repeat(60));

  let totalAdded = 0;

  try {
    // Step 1: Load existing business names to prevent duplicates
    console.log('Loading existing leads from Google Sheet...');
    const existing = await getExistingBusinessNames();
    console.log(`  Found ${existing.size} existing businesses in sheet`);

    // Step 2: Search Apollo for HVAC decision-makers
    console.log('\nSearching Apollo.io...');
    let allCandidates = [];
    let page = 1;

    // Fetch up to 3 pages to give plenty of candidates to filter from
    while (allCandidates.length < MAX_LEADS * 4 && page <= 3) {
      const data = await searchHVACPeople(page, 50);
      const people = data.people || data.contacts || [];

      if (!people.length) break;

      console.log(`  Page ${page}: ${people.length} results`);
      allCandidates.push(...people);
      page++;

      if (page <= 3) await sleep(500); // be polite to the API
    }

    if (!allCandidates.length) {
      await sendAlert(
        'Apollo returned 0 results',
        'The people search returned no results. Check your Apollo API key and plan level.\n' +
          'Apollo endpoint: POST /v1/mixed_people/search\n' +
          'Required plan: Apollo Basic or higher.'
      );
      return;
    }

    console.log(`\nTotal candidates found: ${allCandidates.length}`);

    // Step 3: Filter to SW Michigan only
    const michiganOnly = allCandidates.filter(isInSWMichigan);
    console.log(`After SW Michigan filter: ${michiganOnly.length}`);

    // Step 4: One best contact per company, highest-priority title wins
    const deduped = pickBestContactPerCompany(michiganOnly);
    console.log(`After dedup by company: ${deduped.length}`);

    // Step 5: Remove companies already in the sheet
    const newCandidates = deduped.filter((p) => {
      const bizName = (
        p.organization?.name ||
        p.account?.name ||
        ''
      ).trim().toLowerCase();
      return bizName && !existing.has(bizName);
    });
    console.log(`After removing sheet duplicates: ${newCandidates.length}`);

    if (!newCandidates.length) {
      console.log('\nNo new leads to add today. Sheet is up to date.');
      return;
    }

    // Step 6: Enrich each candidate to get phone number, cap at MAX_LEADS
    const toProcess = newCandidates.slice(0, MAX_LEADS);
    console.log(`\nEnriching ${toProcess.length} candidates...`);

    const rows = [];
    const today = runStart.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });

    for (let i = 0; i < toProcess.length; i++) {
      const person = toProcess[i];
      const orgName =
        person.organization?.name || person.account?.name || '';
      const domain =
        person.organization?.primary_domain ||
        person.organization?.website_url?.replace(/^https?:\/\//, '') ||
        '';

      process.stdout.write(
        `  [${i + 1}/${toProcess.length}] ${orgName} — enriching...`
      );

      let enriched = person;
      let phone = extractPhone(person);

      // Attempt enrichment if no phone from search result
      if (!phone) {
        try {
          const result = await enrichPerson({
            id: person.id,
            firstName: person.first_name,
            lastName: person.last_name,
            domain,
            orgName,
          });
          enriched = result.person || result;
          phone = extractPhone(enriched);
        } catch (enrichErr) {
          // Non-fatal: skip phone enrichment, continue without phone
          process.stdout.write(' (enrichment failed)');
        }
      }

      // Skip contacts with no phone (user requirement)
      if (!phone) {
        process.stdout.write(' ✗ no phone\n');
        await sleep(300);
        continue;
      }

      const city =
        enriched.city ||
        person.city ||
        enriched.organization?.city ||
        '';
      const website =
        enriched.organization?.website_url ||
        person.organization?.website_url ||
        domain ||
        '';

      rows.push([
        today,                          // A: Date Added
        orgName,                        // B: Business Name
        enriched.first_name || person.first_name || '', // C: Owner First Name
        enriched.last_name || person.last_name || '',   // D: Owner Last Name
        phone,                          // E: Phone Number
        city,                           // F: City
        website,                        // G: Website
        '',                             // H: Called (leave blank)
        '',                             // I: Notes (leave blank)
      ]);

      process.stdout.write(` ✓ ${phone}\n`);
      totalAdded++;

      if (totalAdded >= MAX_LEADS) break;
      await sleep(300);
    }

    // Step 7: Write to Google Sheet
    if (rows.length) {
      console.log(`\nWriting ${rows.length} leads to Google Sheet...`);
      const result = await appendLeads(rows);
      console.log(`  Done. ${result.updatedRows} rows added.`);
    } else {
      console.log('\nNo leads with phone numbers found in this batch.');
      await sendAlert(
        'No leads with phone numbers',
        `Apollo returned ${newCandidates.length} new candidates but none had phone numbers.\n` +
          'Consider enabling phone reveal enrichment (costs credits — see apollo.js enrichPerson).'
      );
    }
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;

    await sendAlert(
      `Lead pull failed: ${err.message}`,
      `Error details:\n${msg}\n\nStack:\n${err.stack}`
    );
  }

  const elapsed = ((Date.now() - runStart.getTime()) / 1000).toFixed(1);
  console.log(`\nRun complete. ${totalAdded} leads added. (${elapsed}s)`);
  console.log('='.repeat(60));
}

// ── Entry point ───────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--now');

if (runNow) {
  // One-shot mode: run immediately and exit
  runLeadPull().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  // Scheduler mode: run on cron schedule and keep process alive
  console.log(
    `Scheduler started. Next run: ${CRON_SCHEDULE} (${CRON_TIMEZONE})`
  );
  console.log('Run `node index.js --now` to trigger immediately.\n');

  cron.schedule(CRON_SCHEDULE, runLeadPull, {
    timezone: CRON_TIMEZONE,
  });
}
