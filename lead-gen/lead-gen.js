/**
 * HVAC Lead Generation — Southwest Michigan
 * Searches Apollo.io for HVAC owner contacts, deduplicates against the master
 * Google Sheet, and appends up to 25 new leads per run.
 *
 * Schedule: daily at 7:00 AM Eastern  (node-cron, timezone-aware)
 * Run once: node lead-gen.js --run-once
 * Scheduled: node lead-gen.js
 */

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURATION — the only section you need to edit regularly
// ============================================================
const CONFIG = {
  // Cities to search. Add/remove freely — one Apollo query per city.
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Industry keywords sent to Apollo's keyword-tag filter.
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // Titles to target, in priority order (Owner wins over President, etc.).
  targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Company headcount range (1–25 = owner-operated small business).
  employeeRange: '1,25',

  // Maximum NEW leads to append per scheduled run.
  maxLeadsPerRun: 25,

  // Google Sheet config
  spreadsheetId: process.env.GOOGLE_SHEET_ID || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8',
  sheetName: 'Untitled', // tab name inside the spreadsheet

  // Column layout — matches the master sheet exactly. Do not reorder.
  columns: ['Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
            'Phone Number', 'City', 'Website', 'Called', 'Notes'],
};

// ============================================================
// APOLLO.IO  (REST API — uses your own APOLLO_API_KEY)
// ============================================================
const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const apolloHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Api-Key': process.env.APOLLO_API_KEY,
});

/**
 * Search Apollo's global people database for one city.
 * Returns up to `limit` raw person objects (no phone yet).
 */
async function apolloSearchCity(city, limit = 50) {
  const payload = {
    person_titles: CONFIG.targetTitles,
    person_locations: [city],
    organization_num_employees_ranges: [CONFIG.employeeRange],
    q_organization_keyword_tags: CONFIG.industryKeywords,
    include_similar_titles: false,
    per_page: Math.min(limit, 100),
    page: 1,
  };

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    { headers: apolloHeaders() }
  );

  return response.data.people || [];
}

/**
 * Enrich a batch of Apollo person IDs to reveal phone numbers.
 * Apollo's bulk_match endpoint accepts up to 10 IDs per call.
 * Returns a map of { apolloId -> enrichedPerson }.
 */
async function apolloEnrich(people) {
  const enriched = {};
  // Chunk into groups of 10 (Apollo's bulk_match limit)
  for (let i = 0; i < people.length; i += 10) {
    const chunk = people.slice(i, i + 10);
    const details = chunk.map(p => ({ id: p.id }));

    try {
      const response = await axios.post(
        `${APOLLO_BASE}/people/bulk_match`,
        { details, reveal_personal_emails: false, reveal_phone_number: true },
        { headers: apolloHeaders() }
      );
      const matches = response.data.matches || [];
      matches.forEach(m => { enriched[m.id] = m; });
    } catch (err) {
      // A single enrichment chunk failure shouldn't abort the whole run
      log(`warn`, `Enrichment chunk failed (ids ${chunk.map(p => p.id).join(',')}): ${err.message}`);
    }

    // Respect Apollo's rate limits
    await sleep(300);
  }
  return enriched;
}

/**
 * Pick the best available phone from an enriched person record.
 * Priority: mobile > direct > first available number.
 */
function pickPhone(person) {
  const phones = person.phone_numbers || [];
  if (!phones.length) return null;

  const mobile = phones.find(p => p.type === 'mobile');
  if (mobile) return formatPhone(mobile.sanitized_number || mobile.raw_number);

  const direct = phones.find(p => p.type === 'direct');
  if (direct) return formatPhone(direct.sanitized_number || direct.raw_number);

  return formatPhone(phones[0].sanitized_number || phones[0].raw_number);
}

function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw; // return as-is if unexpected format
}

/**
 * Convert a raw Apollo person object into the lead row format.
 * Returns null if the person has no phone after enrichment.
 */
function buildLeadRow(person, enriched) {
  const e = enriched[person.id] || person;
  const phone = pickPhone(e);
  if (!phone) return null;

  const org = e.organization || person.organization || {};
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return {
    dateAdded: today,
    businessName: (org.name || '').trim(),
    ownerFirstName: (e.first_name || '').trim(),
    ownerLastName: (e.last_name || '').replace(/\*/g, '').trim(), // strip Apollo masking
    phoneNumber: phone,
    city: (e.city || person.city || '').trim(),
    website: (org.website_url || '').trim(),
    called: '',
    notes: '',
  };
}

// ============================================================
// GOOGLE SHEETS
// ============================================================

/**
 * Initialise the Google Sheets API client using a service account.
 * The service account JSON path comes from GOOGLE_SERVICE_ACCOUNT_KEY.
 */
function buildSheetsClient() {
  const keyPath = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-service-account.json'
  );
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Google service account key not found at: ${keyPath}\n` +
      `Set GOOGLE_SERVICE_ACCOUNT_KEY in .env to the correct path.`
    );
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Read every business name already in the master sheet (column B).
 * Returns a Set of lowercase trimmed names for O(1) duplicate checks.
 */
async function readExistingBusinessNames(sheets) {
  const range = `${CONFIG.sheetName}!B2:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range,
  });
  const rows = res.data.values || [];
  return new Set(rows.map(r => (r[0] || '').toLowerCase().trim()));
}

/**
 * Append an array of lead rows to the bottom of the master sheet.
 * Each row must match CONFIG.columns order exactly.
 */
async function appendLeads(sheets, leads) {
  if (!leads.length) return;

  const values = leads.map(l => [
    l.dateAdded,
    l.businessName,
    l.ownerFirstName,
    l.ownerLastName,
    l.phoneNumber,
    l.city,
    l.website,
    l.called,
    l.notes,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values },
  });
}

// ============================================================
// EMAIL ALERTS
// ============================================================

async function sendAlert(subject, body) {
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!to || !pass) {
    log('warn', 'Email alert skipped — ALERT_EMAIL_TO or GMAIL_APP_PASSWORD not set.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass },
  });

  await transporter.sendMail({ from, to, subject, text: body });
  log('info', `Alert email sent to ${to}`);
}

// ============================================================
// CORE WORKFLOW
// ============================================================

async function runWorkflow() {
  log('info', '═══ HVAC Lead Gen run started ═══');

  let sheets;
  try {
    sheets = buildSheetsClient();
  } catch (err) {
    await handleFatalError('Google Sheets auth failed', err);
    return;
  }

  // 1. Gather existing business names to skip duplicates
  let existingNames;
  try {
    existingNames = await readExistingBusinessNames(sheets);
    log('info', `Loaded ${existingNames.size} existing businesses from master sheet`);
  } catch (err) {
    await handleFatalError('Failed to read master sheet', err);
    return;
  }

  // 2. Search Apollo for each target city
  let allPeople = [];
  for (const city of CONFIG.targetCities) {
    try {
      const people = await apolloSearchCity(city, 50);
      log('info', `  ${city}: ${people.length} results from Apollo`);
      allPeople = allPeople.concat(people);
    } catch (err) {
      log('warn', `Apollo search failed for ${city}: ${err.message}`);
    }
    await sleep(500);
  }

  if (!allPeople.length) {
    const msg = 'Apollo returned zero results across all cities. Possible API key issue or plan limit.';
    log('warn', msg);
    await sendAlert('[HVAC Lead Gen] No Apollo results', msg);
    return;
  }

  // 3. Deduplicate by Apollo person ID before enriching
  const seenIds = new Set();
  const uniquePeople = allPeople.filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });
  log('info', `Unique Apollo people to enrich: ${uniquePeople.length}`);

  // 4. Enrich to get phone numbers (costs Apollo credits)
  let enriched = {};
  try {
    enriched = await apolloEnrich(uniquePeople);
    log('info', `Enrichment complete: ${Object.keys(enriched).length} records enriched`);
  } catch (err) {
    log('warn', `Enrichment step failed entirely: ${err.message}`);
    // Proceed with unenriched data — some records have phones in search results
  }

  // 5. Build lead rows: skip those with no phone or already in sheet
  const newLeads = [];
  // Sort by title priority so Owner beats President when the same company appears twice
  const titlePriority = CONFIG.targetTitles.reduce((acc, t, i) => {
    acc[t.toLowerCase()] = i;
    return acc;
  }, {});
  uniquePeople.sort((a, b) => {
    const pa = titlePriority[(a.title || '').toLowerCase()] ?? 99;
    const pb = titlePriority[(b.title || '').toLowerCase()] ?? 99;
    return pa - pb;
  });

  for (const person of uniquePeople) {
    if (newLeads.length >= CONFIG.maxLeadsPerRun) break;

    const row = buildLeadRow(person, enriched);
    if (!row) continue; // no phone found
    if (!row.businessName) continue; // no org name

    const nameKey = row.businessName.toLowerCase().trim();
    if (existingNames.has(nameKey)) {
      log('info', `  Skip duplicate: ${row.businessName}`);
      continue;
    }

    newLeads.push(row);
    existingNames.add(nameKey); // prevent same-run duplicates across cities
  }

  log('info', `New leads ready to append: ${newLeads.length}`);

  if (!newLeads.length) {
    log('info', 'No new leads found this run — sheet is up to date.');
    return;
  }

  // 6. Append to master sheet
  try {
    await appendLeads(sheets, newLeads);
    log('info', `✓ Appended ${newLeads.length} leads to master sheet`);
    newLeads.forEach(l =>
      log('info', `  + ${l.businessName} | ${l.city} | ${l.phoneNumber}`)
    );
  } catch (err) {
    await handleFatalError('Google Sheets append failed', err);
    return;
  }

  log('info', '═══ Run complete ═══\n');
}

// ============================================================
// HELPERS
// ============================================================

function log(level, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`);
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function handleFatalError(context, err) {
  const msg = `${context}: ${err.message}`;
  log('error', msg);
  try {
    await sendAlert(`[HVAC Lead Gen] ERROR: ${context}`, `${msg}\n\nStack:\n${err.stack}`);
  } catch (emailErr) {
    log('error', `Also failed to send alert email: ${emailErr.message}`);
  }
}

// ============================================================
// ENTRY POINT
// ============================================================

const args = process.argv.slice(2);

if (args.includes('--run-once')) {
  // Single immediate run — useful for first-time verification
  log('info', 'Running immediately (--run-once flag detected)');
  runWorkflow().catch(err => {
    log('error', `Unhandled error: ${err.message}`);
    process.exit(1);
  });
} else {
  // Scheduled mode: 7:00 AM Eastern every day
  log('info', 'Scheduler started — will run daily at 07:00 America/New_York');
  cron.schedule('0 7 * * *', () => {
    runWorkflow().catch(err => {
      log('error', `Unhandled error in scheduled run: ${err.message}`);
    });
  }, { timezone: 'America/New_York' });

  // Keep the process alive
  log('info', 'Process is running. Press Ctrl+C to stop.');
}
