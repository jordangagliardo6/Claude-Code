/**
 * HVAC Lead Generator — Southwest Michigan
 *
 * Pulls up to MAX_LEADS_PER_RUN new HVAC business owner leads from Apollo.io,
 * deduplicates against an existing Google Sheet, and appends fresh rows.
 * Runs on a cron schedule (default 7 am ET daily).
 *
 * Usage:
 *   node index.js            → starts the scheduler (keep this process running)
 *   node index.js --run-now  → immediate single run, then exits
 */

require('dotenv').config();
const axios   = require('axios');
const cron    = require('node-cron');
const { google } = require('googleapis');
const fs      = require('fs');
const path    = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const APOLLO_API_KEY    = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID    = process.env.SPREADSHEET_ID   || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8';
const SHEET_NAME        = process.env.SHEET_NAME        || 'Untitled';
const KEY_PATH          = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials/service-account.json';
const ALERT_EMAIL       = process.env.ALERT_EMAIL;
const MAX_LEADS         = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
// "0 12 * * *" = noon UTC = 7 am ET (EST) / 8 am EDT — node-cron runs in UTC inside the process
const CRON_SCHEDULE     = process.env.CRON_SCHEDULE     || '0 12 * * *';

// Target cities for Southwest Michigan
const SW_MICHIGAN_CITIES = [
  'St. Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
  'Grand Haven', 'Muskegon', 'South Haven',
  // Surrounding areas that show up regularly in results
  'Stevensville', 'Portage', 'Paw Paw', 'Coloma', 'Watervliet',
  'Three Rivers', 'Dowagiac', 'Mattawan', 'Zeeland', 'Grand Haven',
];

// NAICS codes for HVAC / Plumbing / Mechanical (2381 = building equipment contractors)
const HVAC_NAICS = ['2381', '23822', '23821'];

// SIC codes: 1711 = Plumbing, Heating, AC; 1731 = Electrical
const HVAC_SIC = ['1711', '1731'];

// Apollo job titles to target, in priority order
const TARGET_TITLES = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function sendErrorAlert(subject, detail) {
  // Console log is always emitted. Email alert requires a mail provider — wire
  // up nodemailer or a transactional API (e.g. SendGrid) here if desired.
  console.error(`\n🚨 ALERT: ${subject}\n${detail}\n`);
  if (ALERT_EMAIL) {
    console.error(`(Email alert to ${ALERT_EMAIL} — add nodemailer/sendgrid to enable.)`);
  }
}

// ─── Google Sheets auth ───────────────────────────────────────────────────────

function getSheetsClient() {
  const keyFilePath = path.resolve(KEY_PATH);

  if (!fs.existsSync(keyFilePath)) {
    throw new Error(
      `Google service account key not found at "${keyFilePath}".\n` +
      `See SETUP.md for instructions, or set GOOGLE_SERVICE_ACCOUNT_KEY_PATH in .env.`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Read existing Business Names from column B (to detect duplicates)
async function getExistingBusinessNames(sheets) {
  const range = `${SHEET_NAME}!B2:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  // Normalize: lowercase + trim for reliable comparison
  return new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
}

// Append rows to the sheet
async function appendRows(sheets, rows) {
  if (rows.length === 0) return;

  const values = rows.map(lead => [
    lead.dateAdded,
    lead.businessName,
    lead.ownerFirstName,
    lead.ownerLastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — leave blank
    '', // Notes — leave blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });

  log(`✅ Appended ${rows.length} new lead(s) to the sheet.`);
}

// ─── Apollo search ────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC business owners in Southwest Michigan.
 *
 * Apollo's People Search (POST /api/v1/mixed_people/search) returns contact
 * records including employer info. We ask for Owner/President/Founder titles
 * at small companies (1–25 employees) in Michigan with HVAC-related keywords.
 *
 * Note: Phone numbers are NOT returned by search — only by enrichment.
 * After getting person IDs we call bulk_match to reveal phone numbers.
 * If your Apollo plan doesn't include enrichment credits you'll get names
 * and companies but empty phone fields; upgrading unlocks them.
 */
async function searchApolloContacts(page = 1, perPage = 50) {
  if (!APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  const payload = {
    api_key: APOLLO_API_KEY,

    // Job titles — Apollo will also include similar titles unless we disable it
    person_titles: TARGET_TITLES,
    include_similar_titles: true,

    // Person must be in Michigan (covers the whole state; we filter by city below)
    person_locations: ['Michigan, United States'],

    // Small owner-operated businesses only
    organization_num_employees_ranges: ['1,10', '11,25'],

    // HVAC / plumbing / mechanical industry signals
    organization_naics_codes: HVAC_NAICS,
    organization_sic_codes: HVAC_SIC,

    // Free-text keyword to bias results toward HVAC companies
    q_keywords: 'HVAC heating cooling air conditioning plumbing mechanical Michigan',

    // Contact must have at least one phone number
    contact_phone_status: ['verified'],

    page,
    per_page: perPage,
  };

  const res = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  return res.data;
}

/**
 * Enrich a batch of person IDs to reveal phone numbers.
 * Apollo's bulk_match endpoint accepts up to 10 IDs at a time.
 * Each batch costs enrichment credits — check your plan limits.
 */
async function enrichPeople(personIds) {
  if (!personIds.length) return [];

  const details = [];

  // Process in batches of 10
  for (let i = 0; i < personIds.length; i += 10) {
    const batch = personIds.slice(i, i + 10);

    const res = await axios.post(
      'https://api.apollo.io/api/v1/people/bulk_match',
      {
        api_key: APOLLO_API_KEY,
        details: batch.map(id => ({ id })),
        reveal_personal_emails: false,
        reveal_phone_number: true,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      }
    );

    const matched = (res.data.matches || []).filter(Boolean);
    details.push(...matched);

    // Small pause between batches to respect rate limits
    if (i + 10 < personIds.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return details;
}

// ─── Main lead-pull logic ─────────────────────────────────────────────────────

async function pullLeads() {
  log('─── Starting HVAC lead pull ───');

  // 1. Connect to Google Sheets
  let sheets;
  try {
    sheets = getSheetsClient();
    log('Google Sheets client initialised.');
  } catch (err) {
    await sendErrorAlert('Google Sheets connection failed', err.message);
    return;
  }

  // 2. Load existing business names so we can skip duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    log(`Loaded ${existingNames.size} existing business names from the sheet.`);
  } catch (err) {
    await sendErrorAlert('Failed to read existing leads from Google Sheet', err.message);
    return;
  }

  // 3. Search Apollo for contacts
  let apolloData;
  try {
    apolloData = await searchApolloContacts(1, 50);
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    await sendErrorAlert('Apollo search failed', detail);
    return;
  }

  const rawContacts = apolloData.people || apolloData.contacts || [];
  log(`Apollo returned ${rawContacts.length} raw contact(s).`);

  if (rawContacts.length === 0) {
    await sendErrorAlert(
      'Apollo returned zero results',
      'No HVAC contacts found for the current search criteria. ' +
      'Consider broadening the filters or checking your Apollo plan limits.'
    );
    return;
  }

  // 4. Filter to Southwest Michigan cities and contacts not already in sheet
  const swMichiganLower = SW_MICHIGAN_CITIES.map(c => c.toLowerCase());

  const filtered = rawContacts.filter(contact => {
    const org       = contact.organization || contact.account || {};
    const city      = (
      contact.city ||
      org.raw_address ||
      org.city ||
      ''
    ).toLowerCase();
    const bizName   = (org.name || contact.organization_name || '').toLowerCase().trim();
    const inRegion  = swMichiganLower.some(c => city.includes(c));
    const isNew     = !existingNames.has(bizName);
    return inRegion && isNew;
  });

  log(`${filtered.length} contact(s) pass city + duplicate filters.`);

  if (filtered.length === 0) {
    log('No new leads this run — sheet is already up to date for these results.');
    return;
  }

  // 5. Enrich the filtered contacts to get phone numbers (up to MAX_LEADS)
  const toEnrich = filtered.slice(0, MAX_LEADS);
  const personIds = toEnrich.map(c => c.id).filter(Boolean);

  let enriched = [];
  try {
    enriched = await enrichPeople(personIds);
    log(`Enriched ${enriched.length} contact(s).`);
  } catch (err) {
    // Enrichment failure is non-fatal: we still add contacts, just with blank phones
    log(`Warning: enrichment failed (${err.message}) — leads will have empty phone numbers.`);
    enriched = [];
  }

  // Build a map of enriched data by person id
  const enrichedById = {};
  enriched.forEach(p => {
    if (p && p.id) enrichedById[p.id] = p;
  });

  // 6. Build lead rows
  const newLeads = toEnrich.map(contact => {
    const enrichedContact = enrichedById[contact.id] || contact;
    const org = contact.organization || contact.account || {};

    // Phone: prefer direct/mobile from enrichment, fallback to org phone
    const phones = enrichedContact.phone_numbers || [];
    const directPhone = phones.find(p => p.type === 'direct' || p.type === 'mobile');
    const phone = (
      (directPhone && directPhone.sanitized_number) ||
      (phones[0] && phones[0].sanitized_number) ||
      enrichedContact.sanitized_phone ||
      org.phone ||
      ''
    );

    // Skip contacts with no phone number at all
    if (!phone) return null;

    return {
      dateAdded:      today(),
      businessName:   (org.name || contact.organization_name || '').trim(),
      ownerFirstName: (contact.first_name || '').trim(),
      ownerLastName:  (contact.last_name  || '').replace(/\*+/g, '').trim(), // strip Apollo masking
      phone,
      city:           (contact.city || org.city || '').trim(),
      website:        (org.website_url || org.primary_domain || '').trim(),
    };
  }).filter(Boolean); // remove nulls (no phone)

  log(`${newLeads.length} lead(s) have a phone number and are ready to insert.`);

  if (newLeads.length === 0) {
    log('All filtered contacts lacked a phone number — nothing to insert.');
    return;
  }

  // 7. Append to the sheet
  try {
    await appendRows(sheets, newLeads);
  } catch (err) {
    await sendErrorAlert('Google Sheets write failed', err.message);
    return;
  }

  log(`─── Run complete. Added ${newLeads.length} new lead(s). ───\n`);
}

// ─── Startup checks ───────────────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n🔍 Verifying connections before first run...\n');

  // Apollo
  if (!APOLLO_API_KEY) {
    console.error('❌ APOLLO_API_KEY is missing from your .env file.');
  } else {
    try {
      // Lightweight endpoint to confirm key is valid
      await axios.get('https://api.apollo.io/api/v1/users/me', {
        headers: { 'X-Api-Key': APOLLO_API_KEY },
        timeout: 10_000,
      });
      console.log('✅ Apollo.io — connected successfully.');
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        console.error('❌ Apollo.io — authentication failed. Check your APOLLO_API_KEY.');
      } else {
        console.warn(`⚠️  Apollo.io — unexpected response (${status || err.message}). Proceeding anyway.`);
      }
    }
  }

  // Google Sheets
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log(`✅ Google Sheets — connected. Spreadsheet: "${res.data.properties.title}"`);
  } catch (err) {
    console.error(`❌ Google Sheets — ${err.message}`);
  }

  console.log('\n─────────────────────────────────────────────────\n');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  const runNow = process.argv.includes('--run-now');

  if (runNow) {
    // Immediate one-shot run (used for testing / npm run test-run)
    await verifyConnections();
    await pullLeads();
    process.exit(0);
  }

  // Normal mode: verify once, then start the scheduler
  await verifyConnections();

  log(`Scheduler started. Cron: "${CRON_SCHEDULE}" (UTC). Max ${MAX_LEADS} leads/run.`);
  log('Tip: run  node index.js --run-now  to trigger an immediate pull.\n');

  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      await pullLeads();
    } catch (err) {
      await sendErrorAlert('Uncaught error in pullLeads()', err.stack || err.message);
    }
  }, {
    timezone: 'UTC',
  });

  // Keep the process alive
  process.on('SIGINT', () => {
    log('Scheduler stopped.');
    process.exit(0);
  });
})();
