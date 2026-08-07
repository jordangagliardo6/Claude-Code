/**
 * Apollo.io + Google Sheets — Automated HVAC Lead Generation
 * Target: Southwest Michigan HVAC companies, owner-operated (1–25 employees)
 *
 * Runs on a node-cron schedule (default: 7 AM Eastern daily).
 * Pulls up to 25 new leads per run, de-duplicates against the sheet, and appends.
 *
 * Required env vars (copy .env.example → .env and fill in):
 *   APOLLO_API_KEY
 *   GOOGLE_SERVICE_ACCOUNT_KEY   (path to JSON key file)
 *   GOOGLE_SHEET_ID
 *   NOTIFY_EMAIL
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS  (optional — for email alerts)
 */

'use strict';

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Edit CITIES and TITLE_PRIORITY here to adjust targeting.

const CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Apollo job-title priority order — Owner preferred, GM last resort
const TITLE_PRIORITY = ['owner', 'president', 'founder', 'co-founder', 'co founder', 'general manager'];

// Apollo keyword tags that describe target industries
const INDUSTRY_TAGS = ['hvac', 'heating', 'air conditioning', 'plumbing', 'mechanical contracting'];

// SIC 1711 = Plumbing, Heating, Air-Conditioning; NAICS 238220 = same
const SIC_CODES = ['1711'];
const NAICS_CODES = ['238220'];

const SHEET_TAB = 'Sheet1';  // Name of the tab inside the spreadsheet
const MAX_LEADS = 25;        // Max new leads to add per run

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk';

// Column order must match the sheet exactly
const COLUMNS = ['Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
                 'Phone Number', 'City', 'Website', 'Called', 'Notes'];

// ─── GOOGLE SHEETS INIT ───────────────────────────────────────────────────────

function buildSheetsClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error(
      `Google service account key not found at: ${keyPath}\n` +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY in your .env file to the path of your JSON key.'
    );
  }
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Returns the set of business names already in the sheet (lowercase, trimmed)
async function fetchExistingNames(sheets) {
  const range = `${SHEET_TAB}!B:B`; // Column B = Business Name
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  const rows = res.data.values || [];
  const names = new Set();
  rows.slice(1).forEach(row => { // skip header row
    if (row[0]) names.add(row[0].toString().trim().toLowerCase());
  });
  return names;
}

// Appends an array of row arrays to the sheet
async function appendRows(sheets, rows) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// Ensures the header row exists; safe to call every run
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1:I1`,
  });
  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [COLUMNS] },
    });
    console.log('Header row written to sheet.');
  }
}

// ─── APOLLO API ───────────────────────────────────────────────────────────────

const APOLLO_BASE = 'https://api.apollo.io/v1';

function apolloHeaders() {
  if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set in .env');
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.APOLLO_API_KEY,
    'Cache-Control': 'no-cache',
  };
}

/**
 * Search Apollo for HVAC company owners in SW Michigan.
 * Returns raw Apollo person objects (first 50 candidates before de-dup).
 */
async function searchApolloLeads() {
  const payload = {
    person_titles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
    person_locations: CITIES,
    organization_locations: CITIES,
    q_organization_keyword_tags: INDUSTRY_TAGS,
    organization_num_employees_ranges: ['1,10', '11,25'],
    organization_sic_codes: SIC_CODES,
    include_similar_titles: true,
    per_page: 50,
    page: 1,
  };

  const res = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
    headers: apolloHeaders(),
    timeout: 30000,
  });

  return res.data.people || [];
}

/**
 * Enrich a person to get phone numbers.
 * Returns the enriched person object or null on failure.
 */
async function enrichPerson(person) {
  try {
    const payload = {
      id: person.id,
      reveal_phone_number: true,
    };
    const res = await axios.post(`${APOLLO_BASE}/people/match`, payload, {
      headers: apolloHeaders(),
      timeout: 20000,
    });
    return res.data.person || null;
  } catch (err) {
    // Non-fatal: log and skip enrichment for this person
    console.warn(`  Enrichment skipped for ${person.name}: ${err.message}`);
    return null;
  }
}

// ─── PRIORITY SORTING ─────────────────────────────────────────────────────────

function titleScore(title) {
  if (!title) return TITLE_PRIORITY.length;
  const t = title.toLowerCase();
  const idx = TITLE_PRIORITY.findIndex(p => t.includes(p));
  return idx === -1 ? TITLE_PRIORITY.length : idx;
}

function sortByTitlePriority(people) {
  return [...people].sort((a, b) => titleScore(a.title) - titleScore(b.title));
}

// ─── PHONE EXTRACTION ─────────────────────────────────────────────────────────

function extractPhone(person) {
  // Prefer mobile, then direct, then any work phone
  const phones = person.phone_numbers || [];

  const preferred = ['mobile', 'direct_phone'];
  for (const type of preferred) {
    const match = phones.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to first available
  const any = phones.find(p => p.sanitized_number);
  return any ? any.sanitized_number : null;
}

// ─── LEAD BUILDING ────────────────────────────────────────────────────────────

function buildRow(person, dateStr) {
  const org = person.organization || {};
  const phone = extractPhone(person);

  // Extract city from person location or org location
  let city = '';
  const loc = person.city || org.city || '';
  CITIES.forEach(c => {
    const cityName = c.split(',')[0].trim();
    if (loc.toLowerCase().includes(cityName.toLowerCase())) city = cityName;
  });
  if (!city) city = loc;

  const website = org.website_url || org.primary_domain || '';
  const cleanSite = website.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return [
    dateStr,                        // Date Added
    (org.name || '').trim(),        // Business Name
    (person.first_name || '').trim(), // Owner First Name
    (person.last_name || '').trim(),  // Owner Last Name
    phone || '',                    // Phone Number
    city,                           // City
    cleanSite,                      // Website
    '',                             // Called (blank)
    '',                             // Notes (blank)
  ];
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

async function sendErrorAlert(subject, body) {
  console.error(`\n⚠  ERROR ALERT: ${subject}\n${body}\n`);

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !NOTIFY_EMAIL) {
    console.error('(SMTP not configured — error logged to console only)');
    return;
  }

  try {
    const transporter = nodemailer.createTransporter({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: SMTP_USER,
      to: NOTIFY_EMAIL,
      subject: `[Lead Gen Alert] ${subject}`,
      text: body,
    });
    console.log(`Alert email sent to ${NOTIFY_EMAIL}`);
  } catch (mailErr) {
    console.error('Failed to send alert email:', mailErr.message);
  }
}

// ─── MAIN WORKFLOW ────────────────────────────────────────────────────────────

async function runWorkflow({ testRun = false } = {}) {
  const startedAt = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Apollo Lead Gen — run started at ${startedAt}`);
  console.log(`${'─'.repeat(60)}`);

  let sheets;
  try {
    sheets = buildSheetsClient();
  } catch (err) {
    await sendErrorAlert('Google Sheets init failed', err.message);
    return;
  }

  // 1. Ensure headers exist
  try {
    await ensureHeaders(sheets);
  } catch (err) {
    await sendErrorAlert('Could not verify sheet headers', err.message);
    return;
  }

  // 2. Load existing business names to check duplicates
  let existingNames;
  try {
    existingNames = await fetchExistingNames(sheets);
    console.log(`Existing leads in sheet: ${existingNames.size}`);
  } catch (err) {
    await sendErrorAlert('Failed to read existing sheet data', err.message);
    return;
  }

  // 3. Search Apollo for candidates
  let candidates;
  try {
    console.log('Searching Apollo.io for SW Michigan HVAC owners...');
    candidates = await searchApolloLeads();
    console.log(`Apollo returned ${candidates.length} candidates`);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    await sendErrorAlert('Apollo search failed', `Error: ${msg}\n\nCheck your APOLLO_API_KEY and plan access.`);
    return;
  }

  if (!candidates.length) {
    await sendErrorAlert('Apollo returned zero results',
      'The search returned no candidates. Try broadening the location or industry filters.');
    return;
  }

  // 4. Sort by title priority, then filter duplicates
  const sorted = sortByTitlePriority(candidates);
  const newCandidates = sorted.filter(p => {
    const bizName = (p.organization?.name || '').trim().toLowerCase();
    return bizName && !existingNames.has(bizName);
  });
  console.log(`New candidates (not already in sheet): ${newCandidates.length}`);

  // 5. Enrich each candidate to get phone numbers, stop at MAX_LEADS
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const newRows = [];

  for (const person of newCandidates) {
    if (newRows.length >= MAX_LEADS) break;

    console.log(`  Enriching: ${person.name} @ ${person.organization?.name || 'unknown'}`);
    const enriched = await enrichPerson(person);
    const data = enriched || person; // fall back to un-enriched if enrichment fails

    const phone = extractPhone(data);
    if (!phone) {
      console.log(`    → No phone found, skipping`);
      continue;
    }

    const row = buildRow(data, today);
    newRows.push(row);
    console.log(`    ✓ Added: ${row[1]} | ${phone} | ${row[5]}`);

    // Respect Apollo rate limits — small delay between enrichments
    await new Promise(r => setTimeout(r, 500));
  }

  // 6. Write to sheet
  if (!newRows.length) {
    console.log('No new leads with phone numbers found this run.');
    return;
  }

  if (testRun) {
    console.log(`\n[TEST RUN] Would have appended ${newRows.length} rows:`);
    newRows.forEach(r => console.log('  ', r));
    return;
  }

  try {
    await appendRows(sheets, newRows);
    console.log(`\n✅ Appended ${newRows.length} new lead(s) to the sheet.`);
  } catch (err) {
    await sendErrorAlert('Google Sheets write failed',
      `Could not append ${newRows.length} leads.\n\nError: ${err.message}`);
  }
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

const isTestRun = process.argv.includes('--test-run');

if (isTestRun) {
  // Run once immediately in test mode (no sheet writes)
  console.log('Running in TEST mode — no data will be written to the sheet.');
  runWorkflow({ testRun: true }).then(() => {
    console.log('\nTest run complete.');
    process.exit(0);
  }).catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
} else {
  // Run once immediately on startup (first connection test)
  console.log('Running initial connection check...');
  runWorkflow().catch(err => console.error('Startup run error:', err));

  // Then schedule daily at 7 AM Eastern Time
  cron.schedule('0 7 * * *', () => {
    runWorkflow().catch(err => console.error('Scheduled run error:', err));
  }, {
    scheduled: true,
    timezone: 'America/New_York',
  });

  console.log('\nScheduler active — will run every day at 7:00 AM Eastern Time.');
  console.log('Keep this process running (use pm2 or a systemd service in production).');
}
