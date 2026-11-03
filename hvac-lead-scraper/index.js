/**
 * HVAC Lead Generator — Southwest Michigan
 *
 * Searches Apollo.io for HVAC company owners, deduplicates against
 * an existing Google Sheet, and appends up to 25 new leads per run.
 * Runs automatically at 7:00 AM Eastern Time via node-cron.
 *
 * Usage:
 *   node index.js                  → start scheduler (keeps process alive)
 *   node index.js --run-now        → run once immediately, then exit
 *   node index.js --test-connections → verify Apollo + Sheets, then exit
 */

require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ─── Configuration ─────────────────────────────────────────────────────────────
// Edit this section to change cities, industries, titles, or limits.

const CONFIG = {
  // Cities to target — add/remove freely
  cities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven'
  ],

  // Industry keywords sent to Apollo's organization keyword filter
  industries: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting'
  ],

  // Decision-maker titles in priority order
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Upper bound on company headcount (owner-operated small businesses only)
  maxEmployees: 25,

  // Hard cap on leads appended per scheduled run
  maxLeadsPerRun: 25,

  // Google Sheet settings
  sheetId: process.env.GOOGLE_SHEET_ID,
  sheetTab: 'Leads',

  // Cron: 7:00 AM Eastern Time, every day
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // For error log attribution / future email hook
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com'
};

// Sheet column layout (A through I — do not reorder without updating appendLeads())
const COLUMNS = [
  'Date Added',     // A
  'Business Name',  // B  ← duplicate check uses this column
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',         // left blank
  'Notes'           // left blank
];

// ─── Apollo.io Search ──────────────────────────────────────────────────────────

async function searchApolloLeads() {
  console.log(`[Apollo] Searching ${CONFIG.cities.length} cities for HVAC owners…`);

  // Build location strings Apollo understands
  const locationFilters = CONFIG.cities.map(c => `${c}, Michigan, United States`);

  let response;
  try {
    response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        q_organization_keyword_tags: CONFIG.industries,
        person_titles: CONFIG.jobTitles,
        organization_num_employees_ranges: [`1,${CONFIG.maxEmployees}`],
        organization_locations: locationFilters,
        contact_phone_numbers_exist: true, // skip contacts with no phone at all
        page: 1,
        per_page: CONFIG.maxLeadsPerRun
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': process.env.APOLLO_API_KEY
        }
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo API error (HTTP ${status || 'network'}): ${detail}`);
  }

  const people = response.data?.people ?? [];
  console.log(`[Apollo] Returned ${people.length} contact(s)`);

  // Map Apollo's response shape to our simplified lead object
  const leads = [];
  for (const person of people) {
    const phone = pickBestPhone(person);
    if (!phone) continue; // belt-and-suspenders guard

    leads.push({
      businessName:    person.organization?.name ?? '',
      ownerFirstName:  person.first_name ?? '',
      ownerLastName:   person.last_name ?? '',
      phone,
      city:    person.city ?? person.organization?.city ?? '',
      website: person.organization?.website_url ?? ''
    });
  }

  return leads;
}

// Prefer mobile > direct dial > any phone > org main number
function pickBestPhone(person) {
  const phones = person.phone_numbers ?? [];
  const byType = type => phones.find(p => p.type === type && p.sanitized_number);

  return (
    byType('mobile')?.sanitized_number ||
    byType('direct')?.sanitized_number ||
    phones.find(p => p.sanitized_number)?.sanitized_number ||
    person.organization?.primary_phone?.number ||
    null
  );
}

// ─── Google Sheets Client ──────────────────────────────────────────────────────

async function getSheetsClient() {
  const credPath = path.join(__dirname, 'credentials.json');
  if (!fs.existsSync(credPath)) {
    throw new Error(
      'credentials.json not found.\n' +
      'For a service account: download the JSON key from Google Cloud Console.\n' +
      'For OAuth2: download the OAuth client JSON, then run: npm run setup-google-auth'
    );
  }

  const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  let auth;

  if (creds.type === 'service_account') {
    // Service account — best for unattended automation (no re-auth ever needed)
    auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } else {
    // OAuth2 — requires one-time setup via: npm run setup-google-auth
    const tokenPath = path.join(__dirname, 'token.json');
    if (!fs.existsSync(tokenPath)) {
      throw new Error(
        'token.json not found. Run: npm run setup-google-auth\n' +
        'This completes the one-time OAuth2 authorization flow.'
      );
    }
    const clientInfo = creds.installed ?? creds.web;
    const oauth2 = new google.auth.OAuth2(
      clientInfo.client_id,
      clientInfo.client_secret,
      clientInfo.redirect_uris?.[0] ?? 'urn:ietf:wg:oauth:2.0:oob'
    );
    oauth2.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));
    // Auto-refresh the access token when it expires
    oauth2.on('tokens', tokens => {
      const existing = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
    });
    auth = oauth2;
  }

  return google.sheets({ version: 'v4', auth });
}

// ─── Sheet Helpers ─────────────────────────────────────────────────────────────

// Write column headers if row 1 is empty (idempotent)
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.sheetId,
    range: `${CONFIG.sheetTab}!A1:I1`
  });
  if ((res.data.values?.[0]?.length ?? 0) > 0) return; // already set

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.sheetId,
    range: `${CONFIG.sheetTab}!A1:I1`,
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNS] }
  });
  console.log('[Sheets] Column headers written to row 1');
}

// Return a Set of business names already in the sheet (lowercased for comparison)
async function readExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.sheetId,
    range: `${CONFIG.sheetTab}!B:B` // Column B = Business Name
  });
  const rows = res.data.values ?? [];
  // rows[0] is the header row — skip it
  return new Set(rows.slice(1).map(r => (r[0] ?? '').trim().toLowerCase()));
}

// Append an array of lead objects as new rows
async function appendLeads(sheets, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });

  const rows = leads.map(l => [
    today,
    l.businessName,
    l.ownerFirstName,
    l.ownerLastName,
    l.phone,
    l.city,
    l.website,
    '', // Called
    ''  // Notes
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.sheetId,
    range: `${CONFIG.sheetTab}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });

  return rows.length;
}

// ─── Error Logging ─────────────────────────────────────────────────────────────

function logError(subject, detail) {
  const entry = `[${new Date().toISOString()}] ERROR — ${subject}: ${detail}`;
  console.error(`\n${'!'.repeat(60)}`);
  console.error(entry);
  console.error(`Notification email: ${CONFIG.notificationEmail}`);
  console.error(`${'!'.repeat(60)}\n`);

  // Append to persistent error log alongside the script
  try {
    fs.appendFileSync(path.join(__dirname, 'error.log'), entry + '\n');
  } catch (_) { /* non-fatal if log write fails */ }
}

// ─── Main Workflow ─────────────────────────────────────────────────────────────

async function runWorkflow() {
  const startTs = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${startTs}] HVAC Lead Generation — run starting`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. Fetch leads from Apollo
    const raw = await searchApolloLeads();

    if (raw.length === 0) {
      logError(
        'Apollo returned 0 results',
        'No contacts matched HVAC + Southwest Michigan + phone-required filters. ' +
        'Verify your APOLLO_API_KEY and that your plan has remaining credits.'
      );
      return;
    }

    // 2. Connect to Google Sheets and ensure headers exist
    const sheets = await getSheetsClient();
    await ensureHeaders(sheets);

    // 3. Deduplicate against existing sheet data
    const existing = await readExistingBusinessNames(sheets);
    console.log(`[Sheets] ${existing.size} existing business(es) in sheet`);

    const fresh = raw.filter(l => {
      const key = l.businessName.trim().toLowerCase();
      return key.length > 0 && !existing.has(key);
    });
    console.log(`[Workflow] ${fresh.length} new (non-duplicate) lead(s)`);

    // 4. Cap and append
    const toAdd = fresh.slice(0, CONFIG.maxLeadsPerRun);
    const added = await appendLeads(sheets, toAdd);

    console.log(`[Workflow] ✓ Appended ${added} lead(s) to "${CONFIG.sheetTab}" tab`);
    console.log(`[${new Date().toISOString()}] Run complete.\n`);

  } catch (err) {
    logError('Run failed', err.message);
  }
}

// ─── Connection Test (run before first scheduled execution) ───────────────────

async function testConnections() {
  console.log('\nTesting connections...\n');
  let ok = true;

  // --- Apollo ---
  process.stdout.write('1. Apollo.io API… ');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { person_titles: ['Owner'], organization_locations: ['Kalamazoo, Michigan, United States'], per_page: 1 },
      { headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.APOLLO_API_KEY } }
    );
    const total = res.data?.pagination?.total_entries ?? '?';
    console.log(`✓  (test query found ${total} contacts in Kalamazoo)`);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.log(`✗  ${msg}`);
    ok = false;
  }

  // --- Google Sheets ---
  process.stdout.write('2. Google Sheets… ');
  try {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.sheetId });
    const title = meta.data.properties?.title ?? '(untitled)';
    console.log(`✓  "${title}"`);
    await ensureHeaders(sheets);
    console.log('   Headers confirmed in row 1.');
  } catch (err) {
    console.log(`✗  ${err.message}`);
    ok = false;
  }

  console.log('');
  if (ok) {
    console.log('All connections verified. Start the scheduler with: npm start');
  } else {
    console.log('Fix the errors above, then re-run: npm run test-connections');
    process.exit(1);
  }
}

// ─── Entry Point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test-connections')) {
  testConnections().catch(err => { console.error(err); process.exit(1); });

} else if (args.includes('--run-now')) {
  runWorkflow().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });

} else {
  // Default: start cron scheduler and keep process alive
  console.log('HVAC Lead Scraper — Scheduler starting');
  console.log(`Schedule: ${CONFIG.cronSchedule} (${CONFIG.cronTimezone}) → 7:00 AM Eastern every day`);
  console.log('Run immediately with: npm run run-now\n');

  cron.schedule(CONFIG.cronSchedule, runWorkflow, { timezone: CONFIG.cronTimezone });
}
