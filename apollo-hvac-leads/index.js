/**
 * HVAC Lead Generation Workflow — Southwest Michigan
 *
 * What it does every morning at 7:00 AM Eastern:
 *   1. Searches Apollo.io for HVAC/plumbing/mechanical company owners (1–25 employees)
 *      in St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon,
 *      South Haven, and surrounding SW Michigan communities.
 *   2. Reads the existing Google Sheet to avoid duplicate entries.
 *   3. Appends up to 25 new leads (business name, owner name, phone, city, website).
 *   4. Sends an error email (or console alert) if Apollo or Sheets fails.
 *
 * First run:  node index.js
 *   — tests both API connections, then starts the scheduler.
 *
 * Run immediately now (skips the cron wait):  node index.js --run-now
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — safe to edit without touching the rest of the script
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  spreadsheetId: '1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs',
  sheetTab: 'Untitled',       // The tab name inside the master sheet

  maxLeadsPerRun: 25,          // How many new leads to add per daily run

  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',

  // 7:00 AM Eastern — node-cron v3 supports IANA timezone names
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',
};

// ── Target cities ─────────────────────────────────────────────────────────────
// Add or remove cities here to widen / narrow the search.
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  'Stevensville, Michigan',
  'Portage, Michigan',
  'Watervliet, Michigan',
  'Coloma, Michigan',
  'Paw Paw, Michigan',
  'Mattawan, Michigan',
  'Lawton, Michigan',
  'Three Rivers, Michigan',
];

// ── Job titles — priority order ───────────────────────────────────────────────
// Apollo will try Owner first, then President, etc.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ── Industry keyword tags ─────────────────────────────────────────────────────
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Air Conditioning',
  'Heating Contractor',
  'Refrigeration',
];

// ─────────────────────────────────────────────────────────────────────────────
// APOLLO REST API
// ─────────────────────────────────────────────────────────────────────────────

async function searchApolloLeads() {
  const url = 'https://api.apollo.io/v1/mixed_people/search';

  // Fetch 3× the max so deduplication doesn't leave us short
  const fetchCount = Math.min(CONFIG.maxLeadsPerRun * 3, 100);

  const { data } = await axios.post(
    url,
    {
      page: 1,
      per_page: fetchCount,
      person_titles: TARGET_TITLES,
      include_similar_titles: false,
      person_locations: TARGET_LOCATIONS,
      organization_num_employees_ranges: ['1,10', '11,25'],
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': process.env.APOLLO_API_KEY,
      },
      timeout: 30_000,
    }
  );

  return data.people || [];
}

// Enrich a person by Apollo ID to unlock their phone number (costs 1 export credit)
async function enrichPerson(apolloId) {
  try {
    const { data } = await axios.post(
      'https://api.apollo.io/v1/people/match',
      {
        id: apolloId,
        reveal_personal_emails: false,
        reveal_phone_number: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.APOLLO_API_KEY,
        },
        timeout: 15_000,
      }
    );
    return data.person || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS
// ─────────────────────────────────────────────────────────────────────────────

function getSheetsClient() {
  // Option A: service account (recommended for scheduled / headless runs)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    const keyFile = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
  }

  // Option B: OAuth2 with a stored refresh token
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return google.sheets({ version: 'v4', auth: oauth2 });
  }

  throw new Error(
    'No Google credentials found.\n' +
    'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE (path to service-account-key.json) ' +
    'or set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN in .env'
  );
}

// Returns a lowercase Set of every business name already in column B
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetTab}!B2:B`,
  });
  const rows = res.data.values || [];
  return new Set(rows.map(r => (r[0] || '').trim().toLowerCase()));
}

async function appendLeadsToSheet(sheets, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const rows = leads.map(lead => [
    today,                     // A: Date Added
    lead.businessName,         // B: Business Name
    lead.ownerFirstName || '', // C: Owner First Name
    lead.ownerLastName || '',  // D: Owner Last Name
    lead.phone || '',          // E: Phone Number
    lead.city || '',           // F: City
    lead.website || '',        // G: Website
    '',                        // H: Called (blank — user fills in)
    '',                        // I: Notes (blank — user fills in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetTab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function extractPhone(person) {
  // 1. person.phone_numbers[] — populated after enrichment
  for (const ph of person.phone_numbers || []) {
    const num = ph.sanitized_number || ph.raw_number;
    if (num) return num;
  }
  // 2. organization.phone — sometimes present from search results
  const org = person.organization || person.account || {};
  return org.sanitized_phone || org.phone || null;
}

function mapPersonToLead(person) {
  const org = person.organization || person.account || {};
  return {
    businessName:   org.name || '',
    ownerFirstName: person.first_name || '',
    ownerLastName:  person.last_name || '',
    phone:          extractPhone(person),
    city:           person.city || org.city || '',
    website:        org.website_url || (org.primary_domain ? `https://${org.primary_domain}` : ''),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

async function notifyError(subject, detail) {
  const banner = `\n${'═'.repeat(60)}\nERROR — ${subject}\n${detail}\nTime: ${new Date().toISOString()}\n${'═'.repeat(60)}\n`;
  console.error(banner);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return; // SMTP not configured

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: CONFIG.notificationEmail,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${detail}\n\nRun time: ${new Date().toISOString()}`,
    });
    console.log(`  📧  Alert email sent to ${CONFIG.notificationEmail}`);
  } catch (emailErr) {
    console.error('  ⚠  Failed to send alert email:', emailErr.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WORKFLOW — one full run
// ─────────────────────────────────────────────────────────────────────────────

async function runLeadGenWorkflow() {
  const runLabel = `[${new Date().toISOString()}]`;
  console.log(`\n${runLabel} ▶  Starting HVAC lead gen run...`);

  // ── 1. Apollo search ──────────────────────────────────────────────────────
  let rawPeople;
  try {
    rawPeople = await searchApolloLeads();
    console.log(`  Apollo: ${rawPeople.length} candidate(s) returned`);
  } catch (err) {
    await notifyError(
      'Apollo search failed',
      `Apollo returned an error: ${err.response?.data?.message || err.message}`
    );
    return;
  }

  if (rawPeople.length === 0) {
    await notifyError(
      'Apollo returned 0 results',
      'Apollo returned no results for SW Michigan HVAC. Check your API key, plan limits, or try broadening the location list.'
    );
    return;
  }

  // ── 2. Connect to Google Sheets ───────────────────────────────────────────
  let sheets, existingNames;
  try {
    sheets = getSheetsClient();
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`  Sheet:  ${existingNames.size} existing business(es) on record`);
  } catch (err) {
    await notifyError('Google Sheets read failed', err.message);
    return;
  }

  // ── 3. Map → filter → dedup → cap at maxLeadsPerRun ──────────────────────
  const leads = [];

  for (const person of rawPeople) {
    if (leads.length >= CONFIG.maxLeadsPerRun) break;

    let lead = mapPersonToLead(person);

    // If no phone from search, try enrichment (costs 1 credit per person)
    if (!lead.phone && person.id) {
      const enriched = await enrichPerson(person.id);
      if (enriched) lead = mapPersonToLead(enriched);
    }

    if (!lead.phone)         continue; // still no phone — skip
    if (!lead.businessName)  continue; // can't dedup without a name

    const nameKey = lead.businessName.trim().toLowerCase();
    if (existingNames.has(nameKey)) {
      console.log(`  Skip (dup): ${lead.businessName}`);
      continue;
    }

    leads.push(lead);
    existingNames.add(nameKey); // guard against within-run duplicates
  }

  console.log(`  New leads after dedup: ${leads.length}`);

  if (leads.length === 0) {
    console.log(`${runLabel}  No new leads to add this run (all were duplicates or missing phones).`);
    return;
  }

  // ── 4. Write to sheet ──────────────────────────────────────────────────────
  try {
    await appendLeadsToSheet(sheets, leads);
    console.log(`${runLabel}  ✅  Added ${leads.length} row(s) to sheet`);
    leads.forEach(l => console.log(`    • ${l.businessName}  |  ${l.city}  |  ${l.phone}`));
  } catch (err) {
    await notifyError(
      'Google Sheets write failed',
      `Failed to write ${leads.length} lead(s).\n\nError: ${err.message}\n\nLeads ready:\n` +
      leads.map(l => `  ${l.businessName} | ${l.city} | ${l.phone}`).join('\n')
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP CONNECTIVITY TEST — run once before scheduling
// ─────────────────────────────────────────────────────────────────────────────

async function testConnections() {
  let allGood = true;

  console.log('\n🔍  Testing Apollo.io connection...');
  try {
    const { data } = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { page: 1, per_page: 1, person_titles: ['Owner'], person_locations: ['Michigan, United States'] },
      {
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.APOLLO_API_KEY },
        timeout: 15_000,
      }
    );
    const count = (data.people || []).length;
    console.log(`    ✅  Apollo connected — returned ${count} test result(s)`);
  } catch (err) {
    console.error(`    ❌  Apollo FAILED: ${err.response?.data?.message || err.message}`);
    allGood = false;
  }

  console.log('🔍  Testing Google Sheets connection...');
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.spreadsheetId });
    const title = res.data.properties.title;
    const tabs  = res.data.sheets.map(s => s.properties.title).join(', ');
    console.log(`    ✅  Google Sheets connected`);
    console.log(`        Spreadsheet: "${title}"`);
    console.log(`        Tabs found:  ${tabs}`);
  } catch (err) {
    console.error(`    ❌  Google Sheets FAILED: ${err.message}`);
    allGood = false;
  }

  return allGood;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Southwest Michigan');
  console.log('═══════════════════════════════════════════════════════════');

  if (!process.env.APOLLO_API_KEY) {
    console.error('❌  APOLLO_API_KEY is missing. Copy .env.example → .env and fill it in.');
    process.exit(1);
  }

  const connected = await testConnections();

  if (!connected) {
    console.error('\n❌  Connection test failed. Fix the errors above before starting the scheduler.\n');
    process.exit(1);
  }

  console.log(`
✅  Both APIs connected.

  Spreadsheet: ${CONFIG.spreadsheetId}
  Sheet tab:   ${CONFIG.sheetTab}
  Max leads:   ${CONFIG.maxLeadsPerRun} per run
  Schedule:    ${CONFIG.cronSchedule} (${CONFIG.cronTimezone})
`);

  // --run-now flag bypasses the cron wait and runs immediately (useful for testing)
  if (process.argv.includes('--run-now')) {
    console.log('▶  --run-now flag detected. Running workflow immediately...');
    await runLeadGenWorkflow();
    console.log('\nOne-shot run complete. Exiting.');
    process.exit(0);
  }

  // Schedule daily at 7:00 AM Eastern
  cron.schedule(CONFIG.cronSchedule, runLeadGenWorkflow, {
    scheduled: true,
    timezone: CONFIG.cronTimezone,
  });

  console.log('⏰  Scheduler active. Waiting for 7:00 AM Eastern...');
  console.log('   (To run right now without waiting, restart with:  node index.js --run-now)\n');
}

main().catch(err => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
