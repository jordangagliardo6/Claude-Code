/**
 * HVAC Lead Generation Workflow — SW Michigan
 *
 * Flow:
 *   1. Search Apollo.io for HVAC company owners/decision-makers in SW Michigan
 *   2. Enrich results to reveal phone numbers (costs Apollo credits)
 *   3. Read current spreadsheet rows to detect duplicates
 *   4. Append new leads (up to MAX_LEADS_PER_RUN)
 *
 * Run manually:   node index.js
 * Scheduled:      node scheduler.js  (7am ET daily)
 * Test setup:     node test-connection.js
 */

require('dotenv').config();
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const { sendErrorEmail } = require('./notify');

// ─── Config ──────────────────────────────────────────────────────────────────

const APOLLO_API_KEY        = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID        = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_TAB             = process.env.GOOGLE_SHEET_TAB_NAME || 'Sheet1';
const CREDENTIALS_PATH      = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const MAX_LEADS             = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const TARGET_CITIES         = (process.env.TARGET_CITIES || 'St. Joseph,Benton Harbor,Kalamazoo,Holland,Grand Haven,Muskegon,South Haven')
                                .split(',').map(c => c.trim());

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// SIC 1711 = Plumbing, Heating & Air-Conditioning
// NAICS 238220 = Plumbing, Heating & AC Contractors
const SEARCH_PARAMS = {
  person_titles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
  // State-level filter; city filtering is applied after enrichment
  person_locations:             ['Michigan, United States'],
  organization_locations:       ['Michigan, United States'],
  organization_num_employees_ranges: ['1,10', '11,25'],
  organization_naics_codes:     ['238220'],
  organization_sic_codes:       ['1711'],
  // Keyword tags as a secondary signal
  q_organization_keyword_tags:  ['HVAC', 'heating', 'air conditioning', 'plumbing', 'mechanical contracting'],
  include_similar_titles:       false,
};

// ─── Apollo helpers ───────────────────────────────────────────────────────────

async function searchPeople(page = 1, perPage = 50) {
  const res = await axios.post(
    `${APOLLO_BASE}/mixed_people/api_search`,
    { ...SEARCH_PARAMS, page, per_page: perPage },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': APOLLO_API_KEY,
      },
    }
  );
  return res.data.people || [];
}

// Enriches a batch of person IDs to reveal phone numbers.
// Returns enriched person objects. Costs 1 Apollo credit per person.
async function enrichPeople(personIds) {
  if (!personIds.length) return [];

  const details = personIds.map(id => ({ id }));
  const res = await axios.post(
    `${APOLLO_BASE}/people/bulk_match`,
    {
      reveal_personal_emails: false,
      reveal_phone_number: true,
      details,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': APOLLO_API_KEY,
      },
    }
  );
  return res.data.matches || [];
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

async function getSheetsClient() {
  const auth = new GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Returns a Set of business names already in the sheet (column B, rows 2+)
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!B2:B`,
  });
  const rows = res.data.values || [];
  return new Set(rows.map(r => (r[0] || '').trim().toLowerCase()));
}

// Appends an array of row arrays to the sheet
async function appendRows(sheets, rows) {
  if (!rows.length) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// Ensures the header row exists; writes it if the sheet is empty
async function ensureHeader(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A1:I1`,
  });
  const existing = (res.data.values || [])[0] || [];
  if (!existing.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_TAB}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Date Added','Business Name','Owner First Name','Owner Last Name','Phone Number','City','Website','Called','Notes']],
      },
    });
    console.log('  ✓ Header row written');
  }
}

// ─── Data transformation ──────────────────────────────────────────────────────

function isSouthwestMichigan(person) {
  const city = (
    person.city ||
    person.present_raw_address ||
    (person.organization && person.organization.city) ||
    ''
  ).toLowerCase();

  // Accept SW Michigan cities plus the broader region
  const swMichiganPatterns = [
    ...TARGET_CITIES.map(c => c.toLowerCase()),
    'berrien', 'cass', 'van buren', 'allegan', 'ottawa', 'kalamazoo',
    'muskegon', 'stevensville', 'coloma', 'watervliet', 'saugatuck',
    'douglas', 'fennville', 'covert', 'hartford', 'paw paw', 'lawton',
    'mattawan', 'portage', 'oshtemo', 'three rivers', 'sturgis',
  ];

  return swMichiganPatterns.some(pattern => city.includes(pattern));
}

function extractPhone(person) {
  // Prefer direct dial, fall back to sanitized_phone
  const phone =
    person.direct_dial_status === 'present' ? person.direct_dial_phone :
    person.mobile_phone ||
    person.sanitized_phone ||
    (person.phone_numbers && person.phone_numbers[0] && person.phone_numbers[0].sanitized_number) ||
    null;
  return phone || null;
}

function toSheetRow(person, today) {
  const org  = person.organization || {};
  const city = person.city || org.city || '';
  const web  = org.website_url || org.primary_domain ? `https://${org.primary_domain}` : '';

  return [
    today,                              // A: Date Added
    org.name || '',                     // B: Business Name
    person.first_name || '',            // C: Owner First Name
    person.last_name || '',             // D: Owner Last Name
    extractPhone(person) || '',         // E: Phone Number
    city,                               // F: City
    web,                                // G: Website
    '',                                 // H: Called (blank)
    '',                                 // I: Notes (blank)
  ];
}

// ─── Main workflow ────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n[${new Date().toISOString()}] HVAC lead workflow starting…`);

  if (!APOLLO_API_KEY)   throw new Error('APOLLO_API_KEY is not set in .env');
  if (!SPREADSHEET_ID)   throw new Error('GOOGLE_SPREADSHEET_ID is not set in .env');

  // 1. Search Apollo for people
  console.log('  → Searching Apollo for HVAC owners in Michigan…');
  let candidates;
  try {
    // Pull 50 candidates so we have room to filter by SW Michigan + phone
    candidates = await searchPeople(1, 50);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    if (msg && msg.includes('ENDPOINT_ACCESS_DENIED')) {
      throw new Error(
        'Apollo plan does not include people search API. ' +
        'Upgrade at https://www.apollo.io/pricing and try again.'
      );
    }
    throw err;
  }
  console.log(`     Found ${candidates.length} raw candidates`);

  // 2. Enrich to get phone numbers (costs credits)
  const personIds = candidates.map(p => p.id).filter(Boolean);
  console.log(`  → Enriching ${personIds.length} people for phone numbers (costs Apollo credits)…`);
  let enriched = [];
  if (personIds.length) {
    try {
      enriched = await enrichPeople(personIds);
    } catch (err) {
      console.warn('  ⚠  Enrichment failed, using search-only data:', err.response?.data?.error || err.message);
      enriched = candidates; // fall back to unenriched (phones may be missing)
    }
  }

  // 3. Filter: SW Michigan + must have a phone number
  const qualified = enriched.filter(p => {
    const phone = extractPhone(p);
    return phone && isSouthwestMichigan(p);
  });
  console.log(`     ${qualified.length} contacts with phone numbers in SW Michigan`);

  // 4. Connect to Google Sheets
  console.log('  → Connecting to Google Sheets…');
  const sheets = await getSheetsClient();
  await ensureHeader(sheets);
  const existing = await getExistingBusinessNames(sheets);
  console.log(`     ${existing.size} businesses already in sheet`);

  // 5. Deduplicate and cap at MAX_LEADS
  const today = new Date().toISOString().slice(0, 10);
  const newRows = [];

  for (const person of qualified) {
    if (newRows.length >= MAX_LEADS) break;
    const bizName = ((person.organization && person.organization.name) || '').trim();
    if (!bizName) continue;
    if (existing.has(bizName.toLowerCase())) {
      console.log(`     skip duplicate: ${bizName}`);
      continue;
    }
    newRows.push(toSheetRow(person, today));
    existing.add(bizName.toLowerCase()); // prevent same-run duplicates
  }

  // 6. Append rows
  if (newRows.length) {
    await appendRows(sheets, newRows);
    console.log(`  ✓ Appended ${newRows.length} new lead(s) to sheet`);
    newRows.forEach(r => console.log(`     + ${r[1]} — ${r[5]} — ${r[4]}`));
  } else {
    console.log('  ✓ No new leads to add (all duplicates or no phone numbers found)');
  }

  console.log(`[${new Date().toISOString()}] Done.\n`);
  return { added: newRows.length, skipped: qualified.length - newRows.length };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (require.main === module) {
  run().catch(async err => {
    const msg = `HVAC workflow error: ${err.message}`;
    console.error('\n❌', msg);
    console.error(err.stack);
    await sendErrorEmail(msg).catch(() => {});
    process.exit(1);
  });
}

module.exports = { run };
