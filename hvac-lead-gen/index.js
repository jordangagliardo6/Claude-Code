/**
 * HVAC Lead Generation — Southwest Michigan
 *
 * Searches Apollo.io for HVAC / plumbing / mechanical company owners in SW Michigan,
 * deduplicates against the master Google Sheet, and appends up to MAX_LEADS_PER_RUN
 * fresh leads. Runs automatically at 7:00 AM Eastern every day via node-cron.
 *
 * Usage:
 *   node index.js            → start scheduler (runs daily at 7 AM ET)
 *   node index.js --verify   → test API connections without writing anything
 *   node index.js --test     → run one lead pull right now (writes to sheet)
 */

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const APOLLO_API_KEY    = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID    = process.env.SPREADSHEET_ID    || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8';
const SHEET_TAB_NAME    = process.env.SHEET_TAB_NAME    || 'Untitled';
const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const NOTIFY_EMAIL      = process.env.NOTIFY_EMAIL;
const ERROR_LOG         = path.join(__dirname, 'error.log');

// Southwest Michigan target cities — used to rank results (SW MI leads sort first)
const SW_MICHIGAN_CITIES = [
  'st. joseph', 'saint joseph', 'benton harbor', 'kalamazoo',
  'holland', 'grand haven', 'muskegon', 'south haven',
  // surrounding area also counts
  'stevensville', 'coloma', 'watervliet', 'paw paw', 'mattawan',
  'lawton', 'portage', 'vicksburg', 'plainwell', 'three rivers',
  'dowagiac', 'hartford', 'berrien springs', 'baroda', 'zeeland',
  'grandville', 'kentwood', 'wyoming', 'norton shores',
];

// Apollo search parameters
// SIC 1711 = Plumbing, Heating & Air-Conditioning Contractors
// SIC 7623 = Refrigeration & Air-Conditioning Services
const APOLLO_SEARCH_BODY = {
  per_page: 50,
  page: 1,
  person_titles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],
  person_seniorities: ['owner', 'founder', 'c_suite'],
  person_locations: ['Michigan, United States'],
  organization_locations: ['Michigan, United States'],
  organization_num_employees_ranges: ['1,10', '11,25'],
  organization_sic_codes: ['1711', '7623'],
  q_keywords:
    'HVAC heating cooling air conditioning plumbing mechanical ' +
    'St. Joseph Benton Harbor Kalamazoo Holland Grand Haven Muskegon South Haven Michigan',
};

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg) { console.warn(`[${new Date().toISOString()}] WARN  ${msg}`); }
function err(msg) {
  const line = `[${new Date().toISOString()}] ERROR ${msg}\n`;
  console.error(line.trim());
  try { fs.appendFileSync(ERROR_LOG, line); } catch (_) {}
}

// ─── Error notification (email, optional) ────────────────────────────────────

async function notifyError(message) {
  if (!NOTIFY_EMAIL || !process.env.SMTP_HOST) return;
  try {
    // nodemailer is optional — only used when SMTP vars are set
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: process.env.SMTP_USER,
      to: NOTIFY_EMAIL,
      subject: '[HVAC Lead Gen] Error — manual check required',
      text: message,
    });
    log('Error notification email sent');
  } catch (e) {
    warn(`Could not send error email: ${e.message}`);
  }
}

// ─── Apollo API ───────────────────────────────────────────────────────────────

async function searchApolloContacts(page = 1) {
  const body = { ...APOLLO_SEARCH_BODY, page, api_key: APOLLO_API_KEY };
  const res = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    body,
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
  );
  return {
    people: res.data.people || [],
    totalPages: res.data.pagination?.total_pages || 1,
  };
}

/**
 * Reveal a phone number for a person via Apollo People Match.
 * Costs 1 direct-dial credit per call. Returns the best number found
 * (mobile preferred, then direct, then any) or null if none available.
 */
async function revealPhone(personId) {
  const res = await axios.post(
    'https://api.apollo.io/v1/people/match',
    {
      api_key: APOLLO_API_KEY,
      id: personId,
      reveal_personal_emails: false,
      reveal_phone_number: true,
    },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
  );
  const person = res.data.person;
  if (!person) return null;

  const phones = person.phone_numbers || [];
  const pick = (type) => phones.find(p => p.type === type && p.sanitized_number);

  // Priority: mobile > direct > any available
  const best = pick('mobile') || pick('direct') || phones.find(p => p.sanitized_number);
  return best ? best.sanitized_number : null;
}

/**
 * Format a 10-digit sanitized number (e.g. "2695551234") as "(269) 555-1234"
 */
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return formatPhone(digits.slice(1));
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return raw; // return as-is if unexpected length
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

function buildSheetAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env variable is not set');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getExistingBusinessNames(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB_NAME}!B2:B`,
  });
  return new Set(
    (res.data.values || []).flat().map(n => n.trim().toLowerCase())
  );
}

async function appendLeadsToSheet(auth, leads) {
  const sheets = google.sheets({ version: 'v4', auth });
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rows = leads.map(l => [
    today,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website,
    '',   // Called  — left blank for user
    '',   // Notes   — left blank for user
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
  return rows.length;
}

// ─── Main run ─────────────────────────────────────────────────────────────────

async function run(dryRun = false) {
  log(`── HVAC Lead Gen run starting${dryRun ? ' (DRY RUN — no writes)' : ''} ──`);

  try {
    // 1. Pull candidates from Apollo (up to 3 pages to find enough SW Michigan leads)
    let candidates = [];
    for (let page = 1; page <= 3 && candidates.length < MAX_LEADS_PER_RUN * 3; page++) {
      const { people, totalPages } = await searchApolloContacts(page);
      candidates = candidates.concat(people);
      log(`  Page ${page}/${totalPages} — ${people.length} results (${candidates.length} total)`);
      if (page >= totalPages) break;
    }

    if (candidates.length === 0) {
      throw new Error('Apollo returned 0 results — verify APOLLO_API_KEY and filters');
    }

    // 2. Load existing sheet entries for dedup (skip in --verify mode)
    const auth = buildSheetAuth();
    const existing = await getExistingBusinessNames(auth);
    log(`  Sheet has ${existing.size} existing businesses`);

    // 3. Score candidates: SW Michigan cities float to the top
    candidates.sort((a, b) => {
      const cityA = (a.organization?.city || a.city || '').toLowerCase();
      const cityB = (b.organization?.city || b.city || '').toLowerCase();
      const scoreA = SW_MICHIGAN_CITIES.some(c => cityA.includes(c)) ? 1 : 0;
      const scoreB = SW_MICHIGAN_CITIES.some(c => cityB.includes(c)) ? 1 : 0;
      return scoreB - scoreA;
    });

    // 4. Enrich with phone numbers until we have MAX_LEADS_PER_RUN new leads
    const newLeads = [];
    for (const person of candidates) {
      if (newLeads.length >= MAX_LEADS_PER_RUN) break;

      const company = (person.organization?.name || '').trim();
      if (!company) continue;

      if (existing.has(company.toLowerCase())) {
        log(`  Skip duplicate: ${company}`);
        continue;
      }

      // Reveal phone — costs 1 direct-dial credit each
      let phone = null;
      try {
        phone = await revealPhone(person.id);
      } catch (e) {
        warn(`  Could not reveal phone for ${person.first_name} ${person.last_name} @ ${company}: ${e.message}`);
      }

      if (!phone) {
        log(`  No phone for ${company} — skipping`);
        continue;
      }

      const city    = person.organization?.city || person.city || '';
      const website = person.organization?.website_url || '';

      newLeads.push({
        businessName: company,
        firstName:    person.first_name || '',
        lastName:     person.last_name  || '',
        phone:        formatPhone(phone),
        city,
        website,
      });

      log(`  + ${company} | ${person.first_name} ${person.last_name} | ${formatPhone(phone)} | ${city}`);
    }

    if (newLeads.length === 0) {
      log('  No new leads found after deduplication and phone filter');
      return;
    }

    // 5. Write to Google Sheet (skipped in dry-run mode)
    if (dryRun) {
      log(`  [DRY RUN] Would append ${newLeads.length} leads — not writing`);
    } else {
      const added = await appendLeadsToSheet(auth, newLeads);
      log(`  ✓ Appended ${added} new leads to spreadsheet`);
    }

    log(`── Run complete: ${newLeads.length} leads processed ──\n`);

  } catch (e) {
    const msg = `Run failed: ${e.message}\n${e.stack || ''}`;
    err(msg);
    await notifyError(msg);
    process.exitCode = 1;
  }
}

// ─── Connection verification ──────────────────────────────────────────────────

async function verify() {
  log('── Verifying connections ──');
  let ok = true;

  // Apollo
  try {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set');
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { api_key: APOLLO_API_KEY, per_page: 1, page: 1,
        person_titles: ['Owner'], organization_sic_codes: ['1711'] },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const count = res.data.pagination?.total_entries ?? '?';
    log(`  ✓ Apollo connected — ${count} total matching records available`);
  } catch (e) {
    err(`  ✗ Apollo failed: ${e.response?.data?.message || e.message}`);
    ok = false;
  }

  // Google Sheets
  try {
    const auth = buildSheetAuth();
    const existing = await getExistingBusinessNames(auth);
    log(`  ✓ Google Sheets connected — spreadsheet has ${existing.size} existing businesses`);
    log(`    Spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  } catch (e) {
    err(`  ✗ Google Sheets failed: ${e.message}`);
    ok = false;
  }

  if (ok) {
    log('── Both connections verified. Safe to start the scheduler. ──\n');
  } else {
    log('── One or more connections failed. Check the errors above. ──\n');
    process.exitCode = 1;
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  verify();
} else if (args.includes('--test')) {
  log('--test flag: running one lead pull immediately');
  run(false);
} else {
  // Normal mode: start the scheduler
  // Cron '0 7 * * *' with timezone 'America/New_York' = 7:00 AM Eastern every day
  cron.schedule('0 7 * * *', () => run(false), {
    scheduled: true,
    timezone: 'America/New_York',
  });

  log(`Scheduler started — will run daily at 7:00 AM Eastern (America/New_York)`);
  log(`Spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  log(`Max leads per run: ${MAX_LEADS_PER_RUN}`);
  log('Run "node index.js --verify" first to confirm both API connections are live.\n');
}
