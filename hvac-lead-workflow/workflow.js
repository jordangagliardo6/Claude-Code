/**
 * HVAC Lead Generation Workflow — Southwest Michigan
 *
 * Runs daily at 7:00 AM Eastern, pulls up to 25 new HVAC company
 * owner/decision-maker leads from Apollo.io, and appends them to the
 * "SW Michigan HVAC Leads" Google Sheet (skipping duplicates).
 *
 * Usage:
 *   node workflow.js           → start the scheduler (keeps running)
 *   node workflow.js --run-now → execute one run immediately, then exit
 */

'use strict';

require('dotenv').config();
const cron   = require('node-cron');
const axios  = require('axios');
const { google } = require('googleapis');

// ─── Configuration ────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus';
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const LEADS_PER_RUN  = 25;

// To add/remove cities, edit this array. Each entry is sent to Apollo as a
// person_locations filter (meaning the contact's own location, not just their
// company HQ).
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// SIC 1711 = Plumbing, Heating, Air-Conditioning Contractors
// SIC 7623 = Refrigeration & AC Service and Repair Shops
// To add Plumbing-only or Mechanical Contracting, add SIC 1731 or NAICS 238220.
const HVAC_SIC_CODES = ['1711', '7623'];

// Decision-maker titles in priority order. Apollo searches all of them;
// duplicate-prevention and sheet order handle priority at write time.
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// Column order in the sheet (0-indexed). If you add/remove columns, update
// COLUMN_MAP and the buildRow() function to match.
const SHEET_RANGE = 'Sheet1!A:I';

// ─── Google Sheets auth ───────────────────────────────────────────────────────

function buildSheetsClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.sheets({ version: 'v4', auth });
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────

/**
 * Returns a Set of lowercase business names already present in the sheet.
 * Used to skip duplicates before inserting new rows.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!B:B', // Business Name column only
  });
  const rows = res.data.values || [];
  // Row 0 is the header; skip it.
  return new Set(rows.slice(1).map(r => (r[0] || '').trim().toLowerCase()));
}

/**
 * Appends an array of lead objects to the sheet as new rows.
 * Returns the number of rows actually written.
 */
async function appendLeads(sheets, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  });

  const rows = leads.map(l => [
    today,              // A – Date Added
    l.businessName,     // B – Business Name
    l.firstName,        // C – Owner First Name
    l.lastName,         // D – Owner Last Name
    l.phone,            // E – Phone Number
    l.city,             // F – City
    l.website,          // G – Website
    '',                 // H – Called (left blank)
    '',                 // I – Notes (left blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─── Apollo helpers ───────────────────────────────────────────────────────────

/**
 * Searches Apollo for HVAC decision-makers in SW Michigan.
 * Returns an array of raw Apollo person objects.
 *
 * Apollo plan note: the /mixed_people/search endpoint requires at least
 * the Apollo Basic plan. If you see a 403 / plan error, upgrade at
 * https://www.apollo.io/pricing — the free plan does not include prospecting.
 */
async function searchApolloLeads(page = 1) {
  const response = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    {
      person_titles:                      TARGET_TITLES,
      organization_num_employees_ranges:  ['1,25'],      // owner-operated small shops
      organization_sic_codes:             HVAC_SIC_CODES,
      person_locations:                   SW_MICHIGAN_CITIES,
      // Exclude contacts with no phone by requiring at least one phone type.
      // Apollo surfaces phone data via enrichment; we filter after enrichment.
      per_page: Math.min(LEADS_PER_RUN * 3, 100), // fetch more than we need to absorb dupe filtering
      page,
    },
    {
      headers: {
        'x-api-key':    APOLLO_API_KEY,
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
    }
  );

  return response.data.people || [];
}

/**
 * Enriches a person by Apollo ID to reveal their direct/mobile phone number.
 * Returns the enriched person object (may still lack a phone if Apollo has none).
 *
 * Each successful reveal costs 1 direct-dial credit.
 */
async function enrichPhone(personId) {
  const response = await axios.post(
    'https://api.apollo.io/api/v1/people/match',
    {
      id:                  personId,
      reveal_phone_number: true,
    },
    {
      headers: {
        'x-api-key':    APOLLO_API_KEY,
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
    }
  );
  return response.data.person || null;
}

/**
 * Picks the best available phone number from an enriched Apollo person object.
 * Priority: direct → mobile → other → work → blank.
 */
function pickPhone(person) {
  if (!person) return '';
  const phones = person.phone_numbers || [];

  const ranked = ['direct', 'mobile', 'other', 'work'];
  for (const type of ranked) {
    const match = phones.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fallback: any phone present
  return phones[0]?.sanitized_number || '';
}

/**
 * Maps a raw Apollo person → our lead schema.
 */
function mapLead(person) {
  const org = person.organization || {};
  return {
    businessName: org.name || '',
    firstName:    person.first_name || '',
    lastName:     person.last_name || '',
    phone:        pickPhone(person),
    city:         person.city || org.city || '',
    website:      org.website_url || org.primary_domain || '',
  };
}

// ─── Notification helper ──────────────────────────────────────────────────────

/**
 * Logs an error prominently. Extend this to send email via nodemailer
 * or SMS if you need push alerts (see README for wiring instructions).
 */
function notifyError(context, err) {
  const msg = err?.response?.data
    ? JSON.stringify(err.response.data)
    : err?.message || String(err);

  console.error(`\n[ERROR] ${context}`);
  console.error(`        ${msg}`);
  console.error(`        ${new Date().toISOString()}\n`);
  // To email alerts, uncomment the sendEmail() call below and configure nodemailer:
  // sendEmail(`HVAC Lead Workflow Error: ${context}`, msg).catch(() => {});
}

// ─── Core run logic ───────────────────────────────────────────────────────────

async function runWorkflow() {
  const startedAt = new Date();
  console.log(`[${startedAt.toISOString()}] Starting HVAC lead workflow run...`);

  // Validate environment
  const missing = ['APOLLO_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']
    .filter(k => !process.env[k]);
  if (missing.length) {
    notifyError('Missing environment variables', new Error(missing.join(', ')));
    return;
  }

  let sheets;
  try {
    sheets = buildSheetsClient();
  } catch (err) {
    notifyError('Failed to build Google Sheets client', err);
    return;
  }

  // Load existing business names to prevent duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`  Loaded ${existingNames.size} existing entries for dedup check.`);
  } catch (err) {
    notifyError('Failed to read existing sheet data', err);
    return;
  }

  // Fetch leads from Apollo
  let apolloPeople;
  try {
    apolloPeople = await searchApolloLeads();
    console.log(`  Apollo returned ${apolloPeople.length} raw results.`);
  } catch (err) {
    notifyError('Apollo search failed', err);
    return;
  }

  if (apolloPeople.length === 0) {
    console.log('  Apollo returned no results for today\'s run. Nothing to write.');
    return;
  }

  // Enrich with phone numbers and filter — stop once we have LEADS_PER_RUN
  const newLeads = [];
  for (const person of apolloPeople) {
    if (newLeads.length >= LEADS_PER_RUN) break;

    const orgName = person.organization?.name || '';
    if (!orgName) continue;

    // Skip duplicates
    if (existingNames.has(orgName.toLowerCase().trim())) {
      console.log(`  Skipping duplicate: ${orgName}`);
      continue;
    }

    // Reveal phone — each costs 1 direct-dial credit
    let enriched = person;
    try {
      enriched = await enrichPhone(person.id) || person;
    } catch (err) {
      // Phone reveal failed — keep the lead without a phone rather than drop it
      console.warn(`  Phone reveal failed for ${orgName}: ${err?.response?.data?.message || err.message}`);
    }

    const phone = pickPhone(enriched);

    // Strictly require a phone number per the workflow spec
    if (!phone) {
      console.log(`  No phone available for ${orgName} — skipping.`);
      continue;
    }

    newLeads.push(mapLead(enriched));
    existingNames.add(orgName.toLowerCase().trim()); // prevent within-run dupes
  }

  console.log(`  ${newLeads.length} new qualified leads after dedup + phone filter.`);

  if (newLeads.length === 0) {
    console.log('  No new leads to add today.');
    return;
  }

  // Write to Google Sheet
  try {
    const written = await appendLeads(sheets, newLeads);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`  ✓ Wrote ${written} new leads to the sheet in ${elapsed}s.`);
    console.log(`  Sheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  } catch (err) {
    notifyError('Google Sheets write failed', err);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // One-shot execution for manual testing or CI
  runWorkflow().catch(err => {
    notifyError('Uncaught error in runWorkflow()', err);
    process.exit(1);
  });
} else {
  // Schedule: 7:00 AM Eastern every day
  // node-cron uses server local time; if your server is UTC, this cron
  // expression accounts for ET (UTC-5 standard / UTC-4 daylight):
  //   Standard time (Nov–Mar): 7am ET = 12:00 UTC → '0 12 * * *'
  //   Daylight time (Mar–Nov): 7am ET = 11:00 UTC → '0 11 * * *'
  //
  // The cleanest solution: set TZ=America/New_York in your shell/service
  // before starting, then keep the schedule below as-is.
  cron.schedule('0 7 * * *', () => {
    runWorkflow().catch(err => notifyError('Uncaught error in scheduled run', err));
  }, {
    timezone: 'America/New_York',
  });

  console.log('HVAC Lead Workflow started.');
  console.log('Scheduled for 7:00 AM Eastern every morning.');
  console.log('Press Ctrl+C to stop.');
  console.log('To run immediately without waiting, use: node workflow.js --run-now');
}
