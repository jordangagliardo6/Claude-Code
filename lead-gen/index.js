'use strict';

/**
 * HVAC Lead Generation — SW Michigan
 *
 * Searches Apollo.io for HVAC business owners in Southwest Michigan,
 * deduplicates against the Google Sheet, and appends up to 25 new leads daily.
 *
 * Run once manually:   node index.js --run-now
 * Verify connections:  node index.js --verify
 * Start scheduler:     node index.js          (runs 7:00 AM Eastern every day)
 */

require('dotenv').config();
const cron       = require('node-cron');
const axios      = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

// ─── Configuration ─────────────────────────────────────────────────────────────
// Change these to adjust search scope, column order, or notification settings.

/** Cities to bias Apollo results toward. Used for logging and city extraction. */
const SW_MICHIGAN_CITIES = [
  'St. Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
  'Grand Haven', 'Muskegon', 'South Haven',
];

/** Apollo search filters — edit these to adjust who gets pulled. */
const APOLLO = {
  baseUrl:      'https://api.apollo.io/api/v1',
  jobTitles:    ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
  location:     'Michigan, United States',
  employeeRange: '1,25',  // owner-operated small businesses only
  keywords:     'HVAC heating cooling air conditioning plumbing mechanical Michigan',
  maxPerRun:    25,        // max leads added per daily run
  enrichBatchSize: 10,    // Apollo bulk_match accepts up to 10 per request
};

/** Google Sheets column order — must match your spreadsheet exactly (A=0, B=1, …). */
const SHEET_COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank by this script)
  'Notes',            // I  (left blank by this script)
];

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_TAB      = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

// ─── Apollo API ─────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in SW Michigan.
 * Requires a paid Apollo plan (Basic or higher) for mixed_people/search.
 * Returns an array of raw Apollo person objects with phone enrichment attempted.
 */
async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in your .env file');

  // Step 1: People search — finds matching contacts (no phone numbers yet)
  const searchRes = await axios.post(
    `${APOLLO.baseUrl}/mixed_people/search`,
    {
      api_key:                           apiKey,
      person_titles:                     APOLLO.jobTitles,
      include_similar_titles:            true,
      organization_locations:            [APOLLO.location],
      organization_num_employees_ranges: [APOLLO.employeeRange],
      q_keywords:                        APOLLO.keywords,
      // Pull extra so we have buffer after deduplication
      per_page: Math.min(APOLLO.maxPerRun * 2, 50),
      page:     1,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const people = searchRes.data.people || [];
  console.log(`  Apollo search returned ${people.length} candidates`);

  if (!people.length) return [];

  // Step 2: Bulk match with phone reveal — enriches in batches of 10
  const enriched = [];
  for (let i = 0; i < people.length; i += APOLLO.enrichBatchSize) {
    const batch   = people.slice(i, i + APOLLO.enrichBatchSize);
    const details = batch.map(p => ({ id: p.id }));

    try {
      const enrichRes = await axios.post(
        `${APOLLO.baseUrl}/people/bulk_match`,
        { api_key: apiKey, reveal_phone_number: true, details },
        { headers: { 'Content-Type': 'application/json' } }
      );

      // Response shape varies by plan: .matches or .people
      const matches = enrichRes.data.matches || enrichRes.data.people || batch;
      enriched.push(...matches);
    } catch (err) {
      // Enrichment failure is non-fatal — fall back to unenriched search data
      console.warn(`  Phone enrichment batch ${Math.floor(i / APOLLO.enrichBatchSize) + 1} failed: ${err.message}. Using unenriched data.`);
      enriched.push(...batch);
    }
  }

  // Step 3: Map to our lead shape; drop any contact with no phone
  return enriched
    .map(p => ({
      businessName: extractCompanyName(p),
      firstName:    p.first_name || '',
      lastName:     p.last_name  || '',
      phone:        extractPhone(p),
      city:         extractCity(p),
      website:      extractWebsite(p),
    }))
    .filter(lead => lead.businessName && lead.phone);
}

function extractCompanyName(person) {
  return (
    person.organization?.name  ||
    person.employment_history?.[0]?.organization_name ||
    ''
  );
}

function extractPhone(person) {
  // Priority: mobile > direct dial > any available number
  const numbers = person.phone_numbers || [];
  const byType  = type => numbers.find(ph => ph.type === type)?.sanitized_number;
  return (
    byType('mobile') ||
    byType('direct') ||
    numbers[0]?.sanitized_number ||
    person.mobile_phone         ||
    person.organization?.phone  ||
    ''
  );
}

function extractCity(person) {
  const candidates = [
    person.city,
    person.location?.city,
    person.organization?.city,
    person.account?.city,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = SW_MICHIGAN_CITIES.find(c =>
      candidate.toLowerCase().includes(c.toLowerCase())
    );
    if (match) return match;
  }

  return candidates[0] || 'Michigan';
}

function extractWebsite(person) {
  const org = person.organization || person.account || {};
  if (org.website_url)  return org.website_url;
  if (org.primary_domain) return `https://${org.primary_domain}`;
  return '';
}

// ─── Google Sheets ──────────────────────────────────────────────────────────────

async function getSheetsClient() {
  const keyFile = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const auth    = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Returns a lowercase Set of every business name already in column B.
 * Used to skip duplicates before inserting.
 */
async function getExistingBusinessNames(sheets) {
  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range:         `${SHEET_TAB}!B:B`,
  });
  const rows = res.data.values || [];
  // row 0 is the header — skip it
  return new Set(rows.slice(1).map(r => (r[0] || '').toLowerCase().trim()));
}

async function appendLeadsToSheet(sheets, leads) {
  if (!leads.length) return;

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — user fills this in
    '', // Notes  — user fills this in
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId:    SPREADSHEET_ID,
    range:            `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: rows },
  });
}

// ─── Notifications ───────────────────────────────────────────────────────────────

async function notify(subject, body) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const toEmail  = process.env.NOTIFICATION_EMAIL || smtpUser;

  if (!smtpUser || !smtpPass) {
    // SMTP not configured — log prominently so it's visible in server output
    console.error('\n══════════════════════════════════════════');
    console.error(`NOTIFICATION (SMTP not configured): ${subject}`);
    console.error(body);
    console.error('══════════════════════════════════════════\n');
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth:   { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from:    smtpUser,
    to:      toEmail,
    subject: `[HVAC Lead Gen] ${subject}`,
    text:    body,
  });

  console.log(`  Notification sent to ${toEmail}`);
}

// ─── Verify connections ───────────────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n── Verifying Apollo.io ──────────────────────────────');
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) throw new Error('APOLLO_API_KEY not set');
    const res = await axios.get(
      `${APOLLO.baseUrl}/users/me?api_key=${apiKey}`,
      { timeout: 8000 }
    );
    const user = res.data?.user || res.data;
    console.log(`  ✓ Apollo connected as: ${user.email || user.name || JSON.stringify(user).slice(0, 60)}`);
  } catch (err) {
    console.error(`  ✗ Apollo connection failed: ${err.response?.data?.error || err.message}`);
  }

  console.log('\n── Verifying Google Sheets ──────────────────────────');
  try {
    const sheets   = await getSheetsClient();
    const meta     = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const tabs     = meta.data.sheets?.map(s => s.properties.title).join(', ');
    const rowCount = await getExistingBusinessNames(sheets);
    console.log(`  ✓ Spreadsheet: "${meta.data.properties?.title}"`);
    console.log(`  ✓ Tabs found:  ${tabs}`);
    console.log(`  ✓ Existing leads in "${SHEET_TAB}": ${rowCount.size}`);
  } catch (err) {
    console.error(`  ✗ Google Sheets connection failed: ${err.message}`);
    if (err.message.includes('keyFile')) {
      console.error('    → credentials.json not found. See setup instructions in .env.example');
    }
  }

  console.log('\n── Ready ─────────────────────────────────────────────');
  console.log('  Run "npm run test-run" to execute one lead pull now.');
  console.log('  Run "npm start" to start the 7 AM daily scheduler.\n');
}

// ─── Main workflow ─────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] ── HVAC Lead Gen run starting ──`);

  // 1. Connect to Google Sheets
  let sheets;
  try {
    sheets = await getSheetsClient();
    console.log('  ✓ Google Sheets connected');
  } catch (err) {
    const msg = `Google Sheets connection failed: ${err.message}`;
    console.error(`  ✗ ${msg}`);
    await notify('ERROR — Google Sheets connection failed', `${msg}\n\nCheck GOOGLE_CREDENTIALS_PATH and that credentials.json is valid.`).catch(() => {});
    return;
  }

  // 2. Search Apollo
  let apolloLeads;
  try {
    apolloLeads = await searchApolloLeads();
    console.log(`  ✓ Apollo returned ${apolloLeads.length} candidates with phone numbers`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.response?.data?.error || err.message}`;
    console.error(`  ✗ ${msg}`);
    await notify(
      'ERROR — Apollo search failed',
      `${msg}\n\nCommon causes:\n• API key is invalid or expired\n• Your Apollo plan does not include mixed_people/search (requires Basic or higher)\n• API rate limit hit\n\nCheck https://www.apollo.io/pricing to confirm your plan.`
    ).catch(() => {});
    return;
  }

  if (!apolloLeads.length) {
    const msg = 'Apollo returned 0 results with phone numbers for SW Michigan HVAC. No leads added.';
    console.warn(`  ⚠ ${msg}`);
    await notify('WARNING — Apollo returned no results', msg).catch(() => {});
    return;
  }

  // 3. Load existing names and deduplicate
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`  ✓ ${existingNames.size} existing businesses loaded for dedup check`);
  } catch (err) {
    const msg = `Failed to read existing leads: ${err.message}`;
    console.error(`  ✗ ${msg}`);
    await notify('ERROR — Could not read spreadsheet', msg).catch(() => {});
    return;
  }

  const newLeads = apolloLeads
    .filter(lead => !existingNames.has(lead.businessName.toLowerCase().trim()))
    .slice(0, APOLLO.maxPerRun);

  if (!newLeads.length) {
    console.log('  ✓ No new leads after deduplication — sheet is current.');
    return;
  }

  console.log(`  → ${newLeads.length} new leads to add (${apolloLeads.length - newLeads.length} duplicates skipped)`);

  // 4. Append to sheet
  try {
    await appendLeadsToSheet(sheets, newLeads);
    console.log(`  ✓ Successfully added ${newLeads.length} leads:`);
    newLeads.forEach((l, i) =>
      console.log(`      ${String(i + 1).padStart(2)}. ${l.businessName} — ${l.city} — ${l.phone}`)
    );
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    console.error(`  ✗ ${msg}`);
    await notify('ERROR — Google Sheets write failed', msg).catch(() => {});
  }
}

// ─── Entry point ───────────────────────────────────────────────────────────────
// Timezone is set via TZ=America/New_York in your .env so cron fires at the
// correct local time regardless of server timezone.

if (require.main === module) {
  const [,, ...args] = process.argv;

  if (args.includes('--verify')) {
    verifyConnections().catch(err => { console.error(err); process.exit(1); });
  } else if (args.includes('--run-now')) {
    runLeadGeneration()
      .then(() => { console.log('\nDone.'); process.exit(0); })
      .catch(err => { console.error(err); process.exit(1); });
  } else {
    // Scheduler mode
    const schedule = '0 7 * * *'; // 7:00 AM — respects TZ env var
    console.log(`HVAC lead gen scheduler started. Runs daily at 7:00 AM Eastern.`);
    console.log(`Spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
    cron.schedule(schedule, runLeadGeneration, { timezone: 'America/New_York' });
    console.log('Press Ctrl+C to stop.\n');
  }
}

module.exports = { runLeadGeneration, verifyConnections };
