// ============================================================
// HVAC Lead Generation — Apollo.io → Google Sheets
// Target: SW Michigan HVAC owner-operated companies (1–25 emp)
// Schedule: Every day at 7 AM Eastern via node-cron
//
// Commands:
//   node index.js              → start scheduler (runs at 7 AM)
//   node index.js --run-now    → run immediately (one shot)
//   node index.js --test       → connection test only
// ============================================================

require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');

// ─── CONFIG ──────────────────────────────────────────────────
// Edit this section freely — no other changes needed.

const CONFIG = {
  // SW Michigan cities to search (passed to Apollo as person locations)
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Decision-maker titles in priority order
  targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Industry keywords Apollo will match against company tags
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
    'Heating and Cooling',
  ],

  // Employee size filter: 1–25 (owner-operated small businesses)
  companySizeRanges: ['1,10', '11,25'],

  // Max leads appended per run (keeps daily list manageable)
  maxLeadsPerRun: 25,

  // Google Sheets target — the existing "SW Michigan HVAC Leads" sheet
  spreadsheetId: '1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo',
  sheetTab: 'Sheet1',

  // Alert email for error notifications (logged to console; wire nodemailer if desired)
  notificationEmail: 'jgagliardo98@gmail.com',

  // Cron: "0 7 * * *" with timezone = America/New_York handles DST automatically
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',
};

// ─── APOLLO SEARCH ───────────────────────────────────────────

async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  // Apollo People Search — requires Basic plan or higher for /mixed_people/search.
  // Free plan supports /people/search (your saved contacts only).
  // See: https://knowledge.apollo.io/hc/en-us/articles/4415203183629
  const url = 'https://api.apollo.io/v1/mixed_people/search';

  const payload = {
    api_key: apiKey,
    person_titles: CONFIG.targetTitles,
    person_locations: CONFIG.cities,
    organization_locations: ['Michigan, United States'],
    q_organization_keyword_tags: CONFIG.industryKeywords,
    organization_num_employees_ranges: CONFIG.companySizeRanges,
    per_page: CONFIG.maxLeadsPerRun,
    page: 1,
    include_similar_titles: false,
  };

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    timeout: 30000,
  });

  const people = response.data?.people || [];
  console.log(`  Apollo returned ${people.length} candidate(s)`);
  return people;
}

// ─── DATA MAPPING ────────────────────────────────────────────

function mapPersonToLead(person) {
  const org = person.organization || {};

  // Prefer direct/mobile phone over generic business phone
  const phone =
    person.mobile_phone_number ||
    person.direct_phone_number ||
    person.phone_number ||
    (Array.isArray(person.phone_numbers) && person.phone_numbers[0]?.sanitized_number) ||
    '';

  return {
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    // Last names may be masked on lower plans — enrichment reveals the full value
    lastName: (person.last_name || '').replace(/\*/g, '').trim(),
    phone: phone.trim(),
    city: (person.city || org.city || '').trim(),
    website: (org.website_url || '').trim(),
  };
}

// ─── GOOGLE SHEETS ───────────────────────────────────────────

function buildGoogleAuth() {
  // Option A (recommended): service account JSON stored as env var
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // Option B: path to a service account JSON key file on disk
  if (process.env.GOOGLE_KEY_FILE) {
    return new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  throw new Error(
    'No Google credentials found.\n' +
      'Set GOOGLE_SERVICE_ACCOUNT_JSON (JSON string) or GOOGLE_KEY_FILE (path to JSON key).\n' +
      'See .env.example for details.'
  );
}

async function getExistingBusinessNames(sheets) {
  // Read the Business Name column (B) to build the dedup set
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetTab}!B:B`,
  });

  const names = (res.data.values || []).flat().filter(Boolean);
  // Normalize for case-insensitive comparison
  return new Set(names.map((n) => n.toLowerCase().trim()));
}

async function appendLeads(sheets, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const range = `${CONFIG.sheetTab}!A:I`;

  // Column order: Date Added | Business Name | First | Last | Phone | City | Website | Called | Notes
  const rows = leads.map((lead) => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — fill manually
    '', // Notes — fill manually
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─── MAIN WORKFLOW ───────────────────────────────────────────

async function runWorkflow() {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] ── Running HVAC lead gen workflow ──`);

  try {
    // 1. Connect to Google Sheets
    const auth = buildGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // 2. Load existing business names for dedup
    let existingNames;
    try {
      existingNames = await getExistingBusinessNames(sheets);
      console.log(`  Loaded ${existingNames.size} existing name(s) from sheet`);
    } catch (err) {
      return notifyError(`Failed to read Google Sheet: ${err.message}`);
    }

    // 3. Query Apollo
    let apolloPeople;
    try {
      apolloPeople = await searchApolloLeads();
    } catch (err) {
      const detail = err.response?.data?.error || err.message;
      return notifyError(`Apollo search failed: ${detail}`);
    }

    if (!apolloPeople.length) {
      return notifyError('Apollo returned 0 results — check filters or Apollo plan access.');
    }

    // 4. Map → filter (must have phone, must not already be in sheet)
    const newLeads = apolloPeople
      .map(mapPersonToLead)
      .filter((lead) => lead.phone)                               // skip if no phone
      .filter((lead) => lead.businessName)                        // skip if no company name
      .filter((lead) => !existingNames.has(lead.businessName.toLowerCase().trim())); // dedup

    console.log(
      `  ${newLeads.length} new lead(s) after dedup+phone filter ` +
        `(${apolloPeople.length} total from Apollo)`
    );

    const toAdd = newLeads.slice(0, CONFIG.maxLeadsPerRun);

    // 5. Append to sheet
    let added;
    try {
      added = await appendLeads(sheets, toAdd);
    } catch (err) {
      return notifyError(`Google Sheets write failed: ${err.message}`);
    }

    console.log(`  Done. Appended ${added} lead(s). Run: ${ts}`);
  } catch (err) {
    notifyError(`Unexpected error: ${err.message}`);
  }
}

// ─── ERROR NOTIFICATION ──────────────────────────────────────

function notifyError(message) {
  const ts = new Date().toISOString();
  console.error(`\n[ERROR ${ts}] ${message}`);
  console.error(`  → Notify: ${CONFIG.notificationEmail}`);
  console.error(`  → Add nodemailer + SMTP_* env vars to send email alerts automatically.`);

  // Stub: replace the block below with actual nodemailer/sendgrid call to send email
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST,
  //   port: Number(process.env.SMTP_PORT) || 587,
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // transporter.sendMail({
  //   from: process.env.SMTP_USER,
  //   to: CONFIG.notificationEmail,
  //   subject: 'HVAC Lead Gen — Error',
  //   text: `[${ts}] ${message}`,
  // });
}

// ─── CONNECTION TEST ─────────────────────────────────────────

async function testConnections() {
  console.log('\n── Connection Test ──────────────────────────────────');

  // Apollo
  try {
    const key = process.env.APOLLO_API_KEY;
    if (!key) throw new Error('APOLLO_API_KEY not set');

    // Health check — works on all plan levels
    const res = await axios.get('https://api.apollo.io/v1/auth/health', {
      headers: { 'X-Api-Key': key },
      timeout: 10000,
    });
    console.log(`  ✓ Apollo.io — connected (status ${res.status})`);
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    console.error(`  ✗ Apollo.io — ${detail}`);
    if (detail.includes('API_INACCESSIBLE') || detail.includes('paid')) {
      console.warn(
        '\n  ⚠  Apollo note: /mixed_people/search requires Basic plan ($49/mo) or higher.\n' +
          '     On the Free plan, person search is limited to your saved CRM contacts.\n' +
          '     Upgrade at https://www.apollo.io/pricing\n'
      );
    }
  }

  // Google Sheets
  try {
    const auth = buildGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({
      spreadsheetId: CONFIG.spreadsheetId,
      fields: 'spreadsheetId,properties.title',
    });
    console.log(`  ✓ Google Sheets — connected to "${res.data.properties.title}"`);
  } catch (err) {
    console.error(`  ✗ Google Sheets — ${err.message}`);
    if (err.message.includes('credentials')) {
      console.warn(
        '\n  ⚠  Google note: Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_KEY_FILE.\n' +
          '     See .env.example for setup instructions.\n'
      );
    }
  }

  console.log('─────────────────────────────────────────────────────\n');
}

// ─── ENTRY POINT ─────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test')) {
  // node index.js --test → verify credentials only
  testConnections();
} else if (args.includes('--run-now')) {
  // node index.js --run-now → run once immediately (skip scheduler)
  testConnections().then(runWorkflow);
} else {
  // Default: run connection test, then start cron
  testConnections().then(() => {
    console.log(
      `Scheduler started. Fires daily at 7 AM Eastern (${CONFIG.cronSchedule} ${CONFIG.cronTimezone})`
    );
    console.log('Press Ctrl+C to stop.\n');

    cron.schedule(CONFIG.cronSchedule, runWorkflow, {
      timezone: CONFIG.cronTimezone,
    });
  });
}
