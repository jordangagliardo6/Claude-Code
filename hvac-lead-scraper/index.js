/**
 * HVAC Lead Scraper — Southwest Michigan
 *
 * Runs every morning at 7:00 AM ET via node-cron.
 * Searches Apollo.io for small HVAC/mechanical contractors in Southwest Michigan,
 * deduplicates against the master Google Sheet, and appends up to 25 new leads.
 *
 * Usage:
 *   node index.js             — start scheduler (runs daily at 7am ET)
 *   node index.js --run-now   — run immediately once (for testing / first run)
 */

require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

// ─── Config ──────────────────────────────────────────────────────────────────

// Edit these city / keyword lists freely — they feed the Apollo query
const TARGET_CITIES = [
  'St. Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
  'Grand Haven', 'Muskegon', 'South Haven',
];

// Adjacent cities/towns that fall in the same service corridor
const ADJACENT_CITIES = [
  'Stevensville', 'Coloma', 'Watervliet', 'Paw Paw', 'Mattawan',
  'Portage', 'Vicksburg', 'Three Rivers', 'Lawton', 'Zeeland',
  'Baroda', 'Berrien Springs', 'Plainwell', 'Hartford', 'Dowagiac',
];

const INDUSTRY_KEYWORDS = [
  'HVAC', 'Heating and Air Conditioning', 'Plumbing', 'Mechanical Contracting',
  'Heating and Cooling', 'Air Conditioning',
];

// SIC 1711 = Plumbing, Heating & Air Conditioning Contractors
// NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors
const SIC_CODES  = ['1711'];
const NAICS_CODES = ['23822'];

const OWNER_TITLES = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];

const MAX_LEADS_PER_RUN = 25;

// Column order in the master sheet (0-indexed)
// Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
const SHEET_NAME = 'Sheet1'; // change if your tab has a different name

// ─── Google Sheets Auth ───────────────────────────────────────────────────────

function buildSheetsClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.sheets({ version: 'v4', auth });
}

// ─── Apollo Search ────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 * Returns up to `limit` people objects with phone numbers.
 */
async function searchApolloLeads(limit = MAX_LEADS_PER_RUN) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set');

  const allCities = [...TARGET_CITIES, ...ADJACENT_CITIES];

  // People search — targets owners/presidents at small HVAC companies
  const params = {
    api_key: apiKey,
    q_keywords: allCities.slice(0, 5).join(' ') + ' Michigan',
    person_titles: OWNER_TITLES,
    person_locations: ['Michigan, United States'],
    organization_locations: ['Michigan, United States'],
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    organization_num_employees_ranges: ['1,25'],
    organization_sic_codes: SIC_CODES,
    person_seniorities: ['owner', 'c_suite', 'founder'],
    contact_email_status: ['verified', 'likely to engage'],
    per_page: Math.min(limit * 2, 50), // fetch extra so we have room after dedup
    page: 1,
  };

  const resp = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    params,
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } },
  );

  const people = resp.data?.people || [];

  // Keep only contacts that have at least one phone number
  return people.filter(p =>
    p.phone_numbers?.length > 0 ||
    p.sanitized_phone ||
    p.direct_dial_phone,
  );
}

// ─── Phone number helper ──────────────────────────────────────────────────────

function bestPhone(person) {
  if (person.direct_dial_phone) return person.direct_dial_phone;
  if (person.sanitized_phone)   return person.sanitized_phone;
  if (person.phone_numbers?.length) return person.phone_numbers[0].sanitized_number;
  return '';
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

/** Read all existing business names from column B (dedup guard). */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'B:B',
  });
  const rows = res.data.values || [];
  return new Set(
    rows.flat()
       .map(n => n.trim().toLowerCase())
       .filter(Boolean),
  );
}

/** Append new rows to the master sheet. */
async function appendRows(sheets, spreadsheetId, rows) {
  if (!rows.length) return 0;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
  return rows.length;
}

// ─── Email alert ──────────────────────────────────────────────────────────────

async function sendEmailAlert(subject, body) {
  const email    = process.env.ALERT_EMAIL;
  const password = process.env.GMAIL_APP_PASSWORD;
  if (!email || !password) {
    console.warn('[alert] ALERT_EMAIL or GMAIL_APP_PASSWORD not set — skipping email');
    return;
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email, pass: password },
  });
  await transporter.sendMail({
    from: email,
    to: email,
    subject,
    text: body,
  });
  console.log(`[alert] email sent to ${email}`);
}

// ─── Core workflow ────────────────────────────────────────────────────────────

async function runLeadScraper() {
  const runAt = new Date().toISOString();
  console.log(`\n[${runAt}] === HVAC lead scraper starting ===`);

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not set');

  let sheets;
  try {
    sheets = buildSheetsClient();
  } catch (err) {
    const msg = `Google Sheets auth failed: ${err.message}`;
    console.error('[error]', msg);
    await sendEmailAlert('HVAC Scraper — Auth Error', msg).catch(() => {});
    return;
  }

  // Step 1: pull existing business names so we can dedup
  let existing;
  try {
    existing = await getExistingBusinessNames(sheets, spreadsheetId);
    console.log(`[sheets] ${existing.size} existing businesses loaded`);
  } catch (err) {
    const msg = `Failed to read Google Sheet: ${err.message}`;
    console.error('[error]', msg);
    await sendEmailAlert('HVAC Scraper — Sheets Read Error', msg).catch(() => {});
    return;
  }

  // Step 2: search Apollo
  let candidates;
  try {
    candidates = await searchApolloLeads(MAX_LEADS_PER_RUN);
    console.log(`[apollo] ${candidates.length} candidates returned (with phones)`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    console.error('[error]', msg);
    await sendEmailAlert('HVAC Scraper — Apollo Error', msg).catch(() => {});
    return;
  }

  if (!candidates.length) {
    const msg = 'Apollo returned 0 candidates with phone numbers for today\'s search.';
    console.warn('[warn]', msg);
    await sendEmailAlert('HVAC Scraper — No Results', msg).catch(() => {});
    return;
  }

  // Step 3: dedup and build rows
  const today   = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const newRows = [];

  for (const person of candidates) {
    if (newRows.length >= MAX_LEADS_PER_RUN) break;

    const bizName = (person.organization?.name || person.account?.name || '').trim();
    if (!bizName) continue;
    if (existing.has(bizName.toLowerCase())) {
      console.log(`[skip] duplicate: ${bizName}`);
      continue;
    }

    const phone = bestPhone(person);
    if (!phone) continue;

    const city    = person.city || person.organization?.city || '';
    const website = person.organization?.website_url || '';

    newRows.push([
      today,                   // Date Added
      bizName,                 // Business Name
      person.first_name || '', // Owner First Name
      person.last_name  || '', // Owner Last Name
      phone,                   // Phone Number
      city,                    // City
      website,                 // Website
      '',                      // Called (blank)
      '',                      // Notes (blank)
    ]);

    existing.add(bizName.toLowerCase()); // prevent intra-run duplicates
  }

  if (!newRows.length) {
    console.log('[result] No new (non-duplicate) leads found today.');
    return;
  }

  // Step 4: write to sheet
  try {
    const written = await appendRows(sheets, spreadsheetId, newRows);
    console.log(`[result] Appended ${written} new leads to spreadsheet.`);
    newRows.forEach(r => console.log(`  + ${r[1]} | ${r[4]} | ${r[5]}`));
  } catch (err) {
    const msg = `Failed to write to Google Sheet: ${err.message}\nLeads that failed:\n${newRows.map(r => r[1]).join('\n')}`;
    console.error('[error]', msg);
    await sendEmailAlert('HVAC Scraper — Sheets Write Error', msg).catch(() => {});
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // Immediate single run (for testing or manual trigger)
  runLeadScraper().catch(err => {
    console.error('[fatal]', err.message);
    process.exit(1);
  });
} else {
  // Cron: 7:00 AM Eastern Time (America/New_York = UTC-4 in summer, UTC-5 in winter)
  // '0 12 * * *'  = 7am ET during EST (UTC-5)
  // '0 11 * * *'  = 7am ET during EDT (UTC-4)
  // Using TZ option on the cron expression is the cleanest approach:
  cron.schedule('0 7 * * *', runLeadScraper, {
    timezone: 'America/New_York',
  });

  console.log('HVAC lead scraper scheduled for 7:00 AM Eastern Time every day.');
  console.log('Run `node index.js --run-now` to trigger immediately.');
  console.log('Waiting for next scheduled run...');
}
