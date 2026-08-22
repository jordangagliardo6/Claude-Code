'use strict';

/**
 * HVAC Lead Generation Workflow — Southwest Michigan
 *
 * What it does each run:
 *   1. Searches Apollo.io for HVAC/plumbing/mechanical decision-makers
 *      in the Southwest Michigan cities you specified.
 *   2. Filters out any company already in your Google Sheet (dedup by Business Name).
 *   3. Appends up to 25 new leads with today's date.
 *   4. Emails you on any failure so you always know if a run went sideways.
 *
 * Schedule: daily at 7:00 AM Eastern (America/New_York — DST-aware).
 * Manual run: node index.js --now
 * Connection test: node index.js --verify
 */

require('dotenv').config();
const cron       = require('node-cron');
const axios      = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
// Edit these to change behavior without touching logic below.

const CONFIG = {
  // Apollo API key (from .env)
  apolloApiKey: process.env.APOLLO_API_KEY,

  // Your Google Sheet ID (from .env — pre-filled with your "SW Michigan HVAC Leads" sheet)
  spreadsheetId: process.env.SPREADSHEET_ID || '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus',

  // Tab name inside the spreadsheet
  sheetName: process.env.SHEET_NAME || 'Sheet1',

  // Max new leads to add per daily run
  maxLeadsPerRun: 25,

  // Email address for error alerts
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',

  // Cities to target — add or remove as needed
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Job title priority (index 0 = highest priority)
  targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // NAICS code for Plumbing, Heating, and Air-Conditioning Contractors
  hvacNaicsCodes: ['2382'],

  // Keywords to broaden the search
  industryKeywords: ['HVAC', 'heating', 'cooling', 'air conditioning', 'plumbing', 'mechanical'],
};

// ─── GOOGLE SHEETS CLIENT ────────────────────────────────────────────────────

async function getSheetsClient() {
  // Uses a Service Account credentials.json downloaded from Google Cloud Console.
  // See SETUP.md for step-by-step instructions.
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// ─── DEDUP: read column B (Business Name) from the sheet ────────────────────

async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!B:B`,
  });
  const rows = res.data.values || [];
  // Skip header row; normalize to lowercase for case-insensitive comparison
  return new Set(
    rows.slice(1)
      .map(r => (r[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

// ─── APOLLO SEARCH ───────────────────────────────────────────────────────────

async function searchApolloForCity(city, page = 1) {
  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      api_key: CONFIG.apolloApiKey,
      q_keywords: CONFIG.industryKeywords.join(' ') + ' ' + city,
      person_titles: CONFIG.targetTitles,
      person_locations: [city],
      organization_locations: [city],
      organization_num_employees_ranges: ['1,10', '11,25'],
      organization_naics_codes: CONFIG.hvacNaicsCodes,
      page,
      per_page: 25,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 15000,
    }
  );
  return response.data.people || [];
}

async function fetchAllLeads() {
  const raw = [];
  for (const city of CONFIG.targetCities) {
    // Gather enough raw results across cities; we'll dedup and cap later
    if (raw.length >= CONFIG.maxLeadsPerRun * 3) break;
    try {
      const people = await searchApolloForCity(city);
      for (const p of people) {
        // Require at least one phone number — skip contacts with none
        const phone = pickBestPhone(p);
        if (!phone) continue;
        raw.push({
          businessName: (p.organization?.name || '').trim(),
          firstName:    (p.first_name || '').trim(),
          lastName:     (p.last_name  || '').trim(),
          titleRaw:     (p.title      || '').trim(),
          phone,
          city:         p.city || p.organization?.city || city.split(',')[0],
          website:      (p.organization?.website_url || '').trim(),
        });
      }
      console.log(`  Apollo: ${people.length} results for ${city} (${raw.length} total so far)`);
    } catch (err) {
      // Log per-city failures but keep going — one bad city shouldn't kill the run
      const detail = err.response?.data?.message || err.message;
      console.warn(`  [WARN] Apollo search failed for "${city}": ${detail}`);
    }
  }
  return raw;
}

// Pick the best available phone number in priority order
function pickBestPhone(person) {
  const numbers = person.phone_numbers || [];
  // Apollo returns phone_numbers[] with type: 'direct_phone', 'mobile_phone', 'corporate_phone', etc.
  const priority = ['direct_phone', 'mobile_phone', 'corporate_phone', 'other_phone'];
  for (const type of priority) {
    const match = numbers.find(n => n.type === type);
    if (match?.sanitized_number) return match.sanitized_number;
  }
  // Fallback: any number
  if (numbers[0]?.sanitized_number) return numbers[0].sanitized_number;
  // Last resort: organization phone
  return person.organization?.phone || null;
}

// ─── TITLE PRIORITY SORT ─────────────────────────────────────────────────────

function titlePriorityIndex(titleRaw) {
  const t = titleRaw.toLowerCase();
  for (let i = 0; i < CONFIG.targetTitles.length; i++) {
    if (t.includes(CONFIG.targetTitles[i].toLowerCase())) return i;
  }
  return CONFIG.targetTitles.length; // unknown title goes last
}

function sortByTitlePriority(leads) {
  return [...leads].sort((a, b) =>
    titlePriorityIndex(a.titleRaw) - titlePriorityIndex(b.titleRaw)
  );
}

// ─── APPEND ROWS TO SHEET ────────────────────────────────────────────────────

async function appendLeadsToSheet(sheets, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  // Column order must match your sheet: Date Added | Business Name | Owner First | Owner Last | Phone | City | Website | Called | Notes
  const rows = leads.map(l => [
    today,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website,
    '',   // Called  — left blank for you to fill in
    '',   // Notes   — left blank for you to fill in
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─── ERROR NOTIFICATION ──────────────────────────────────────────────────────

function writeErrorLog(message, stack = '') {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), error: message, stack }) + '\n';
  fs.appendFileSync(path.join(__dirname, 'error.log'), entry);
}

async function sendErrorEmail(subject, body) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[WARN] Gmail credentials not configured — error email skipped. See .env.example.');
    return;
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: CONFIG.notificationEmail,
    subject: `[HVAC Leads] ${subject}`,
    text: body,
  });
  console.log(`Error notification sent to ${CONFIG.notificationEmail}`);
}

// ─── CONNECTION VERIFICATION ─────────────────────────────────────────────────
// Run with: node index.js --verify

async function verifyConnections() {
  console.log('\n═══ CONNECTION VERIFICATION ═══\n');
  let allGood = true;

  // 1. Apollo
  process.stdout.write('1. Apollo.io API ... ');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: CONFIG.apolloApiKey,
        q_keywords: 'HVAC Michigan',
        person_titles: ['Owner'],
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const count = res.data.pagination?.total_entries ?? (res.data.people?.length ?? '?');
    console.log(`✓ Connected  (${count} total results available for test query)`);
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.log(`✗ FAILED — ${detail}`);
    allGood = false;
  }

  // 2. Google Sheets
  process.stdout.write('2. Google Sheets ... ');
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.spreadsheetId });
    const title = res.data.properties?.title;
    const existing = await getExistingBusinessNames(sheets);
    console.log(`✓ Connected  (sheet: "${title}", ${existing.size} existing leads)`);
  } catch (err) {
    console.log(`✗ FAILED — ${err.message}`);
    allGood = false;
  }

  console.log('\n' + (allGood
    ? '✓ All systems connected. First scheduled run will fire at 7:00 AM Eastern.\n'
    : '✗ One or more connections failed. Fix the errors above before relying on the schedule.\n'
  ));
}

// ─── MAIN WORKFLOW ───────────────────────────────────────────────────────────

async function runWorkflow() {
  const startTime = new Date().toISOString();
  console.log(`\n[${startTime}] Starting HVAC lead generation run...`);

  try {
    // Step 1 — Google Sheets connection
    const sheets = await getSheetsClient();
    console.log('✓ Google Sheets connected');

    // Step 2 — Load existing business names for dedup
    const existing = await getExistingBusinessNames(sheets);
    console.log(`✓ Loaded ${existing.size} existing businesses for dedup`);

    // Step 3 — Apollo search across all target cities
    console.log('Searching Apollo.io...');
    const rawLeads = await fetchAllLeads();
    console.log(`  Total raw results with phone numbers: ${rawLeads.length}`);

    if (rawLeads.length === 0) {
      const msg = 'Apollo returned 0 results with phone numbers. Check your API key, plan tier, or search filters.';
      console.error(`[ERROR] ${msg}`);
      writeErrorLog(msg);
      await sendErrorEmail('Run failed — 0 Apollo results', msg);
      return;
    }

    // Step 4 — Dedup against existing sheet entries
    const newLeads = rawLeads.filter(l => {
      const key = l.businessName.toLowerCase();
      return key && !existing.has(key);
    });
    console.log(`  New (non-duplicate) leads: ${newLeads.length}`);

    // Step 5 — Sort by title priority and cap at MAX_LEADS_PER_RUN
    const sorted   = sortByTitlePriority(newLeads);
    const toInsert = sorted.slice(0, CONFIG.maxLeadsPerRun);

    // Step 6 — Write to sheet
    const inserted = await appendLeadsToSheet(sheets, toInsert);
    console.log(`✓ Appended ${inserted} new leads`);
    console.log(`  Sheet URL: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit`);
    console.log(`[${new Date().toISOString()}] Run complete.\n`);

  } catch (err) {
    const msg = `Workflow error: ${err.message}`;
    console.error(`[ERROR] ${msg}`);
    writeErrorLog(msg, err.stack);
    await sendErrorEmail('Workflow error', `${msg}\n\n${err.stack}`).catch(() => {});
  }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  // One-time connection test — does NOT start the scheduler
  verifyConnections().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (args.includes('--now')) {
  // Immediate manual run AND start the scheduler
  runWorkflow();
  scheduleJob();
} else {
  // Normal mode: just start the scheduler
  scheduleJob();
}

function scheduleJob() {
  // '0 7 * * *' = 7:00 AM every day; timezone option handles DST automatically
  cron.schedule('0 7 * * *', () => {
    console.log('Scheduled 7am trigger fired.');
    runWorkflow();
  }, {
    timezone: 'America/New_York',
  });

  console.log('HVAC Lead Workflow running.');
  console.log('Next run: tomorrow at 7:00 AM Eastern (America/New_York, DST-aware).');
  console.log('Verify connections first: node index.js --verify');
  console.log('Trigger immediately:      node index.js --now\n');
}
