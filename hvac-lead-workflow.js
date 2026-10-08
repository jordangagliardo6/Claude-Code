/**
 * HVAC Lead Generation Workflow
 *
 * Searches Apollo.io for HVAC/plumbing company owners in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends up to 25 new leads
 * per run. Scheduled to fire every day at 7:00 AM Eastern Time.
 *
 * Usage:
 *   node hvac-lead-workflow.js              → start the scheduler
 *   node hvac-lead-workflow.js --run-now    → run immediately (test mode)
 *
 * First-time setup: run `node setup.js` to authorize Google Sheets access.
 */

'use strict';

require('dotenv').config();

const cron       = require('node-cron');
const axios      = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs         = require('fs');

// ─── Configuration ────────────────────────────────────────────────────────────
// Edit this block to change cities, column layout, or lead limits.

const CONFIG = {
  // Apollo.io REST API key (set APOLLO_API_KEY in .env)
  apolloApiKey: process.env.APOLLO_API_KEY,

  // Google Sheets — the "Master" spreadsheet ID
  spreadsheetId: '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8',
  sheetName: 'Untitled', // Tab name inside the spreadsheet; change if you rename the tab

  // Maximum new leads to add per scheduled run
  maxLeadsPerRun: 25,

  // Southwest Michigan target cities — add or remove freely
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
    // Surrounding county-level fallbacks to broaden results
    'Berrien County, Michigan',
    'Van Buren County, Michigan',
    'Kalamazoo County, Michigan',
    'Ottawa County, Michigan',
    'Muskegon County, Michigan',
    'Allegan County, Michigan',
  ],

  // Notification email — receives error alerts
  notifyEmail: process.env.NOTIFY_EMAIL || 'jgagliardo98@gmail.com',
};

// ─── Apollo.io: search for HVAC contacts ─────────────────────────────────────

async function searchApolloLeads() {
  const url = 'https://api.apollo.io/v1/mixed_people/search';

  const payload = {
    api_key: CONFIG.apolloApiKey,
    page: 1,
    per_page: CONFIG.maxLeadsPerRun * 3, // fetch extra to account for deduplication

    // Job titles in priority order (Owner > President > Founder …)
    person_titles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
    person_seniorities: ['owner', 'c_suite'],

    // Person must be located in Southwest Michigan
    person_locations: CONFIG.targetCities,

    // Their employer must be in HVAC / plumbing / mechanical
    q_organization_keyword_tags: [
      'HVAC',
      'Heating and Air Conditioning',
      'Heating & Cooling',
      'Plumbing',
      'Mechanical Contracting',
    ],

    // Owner-operated small businesses: 1–25 employees
    organization_num_employees_ranges: ['1,10', '11,25'],
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    timeout: 30_000,
  });

  return response.data.people || [];
}

// ─── Apollo.io: bulk-enrich to reveal phone numbers ──────────────────────────
// Apollo's search endpoint does not return phone numbers; the People Match
// endpoint reveals them (counts against your credit balance).

async function enrichPeopleForPhones(people) {
  if (people.length === 0) return [];

  const url = 'https://api.apollo.io/v1/people/bulk_match';

  const details = people
    .filter(p => p.id)
    .slice(0, CONFIG.maxLeadsPerRun * 3)
    .map(p => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      organization_name: p.organization?.name,
      domain: p.organization?.primary_domain,
    }));

  try {
    const response = await axios.post(url, {
      api_key: CONFIG.apolloApiKey,
      details,
      reveal_personal_emails: false,
      reveal_phone_number: true,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60_000,
    });

    return response.data.matches || [];
  } catch (err) {
    // Enrichment failure is non-fatal; we return original results with fewer phones
    console.warn('  [WARN] Phone enrichment failed:', err.response?.data?.message || err.message);
    return people;
  }
}

// ─── Map an Apollo person record → standardized lead object ──────────────────

function toLeadObject(person) {
  const org = person.organization || {};

  // Prefer mobile > direct dial > any phone number
  const phone =
    person.mobile_phone ||
    person.phone_numbers?.find(p => p.type === 'mobile')?.sanitized_number ||
    person.phone_numbers?.find(p => p.type === 'direct')?.sanitized_number ||
    person.phone_numbers?.[0]?.sanitized_number ||
    '';

  const website =
    org.website_url ||
    (org.primary_domain ? `https://${org.primary_domain}` : '') ||
    '';

  return {
    businessName: (org.name || person.organization_name || '').trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name || '').trim(),
    phone:        phone.trim(),
    city:         (person.city || org.city || '').trim(),
    website:      website.trim(),
  };
}

// ─── Google Sheets: authorize ─────────────────────────────────────────────────

async function getSheets() {
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const tokenPath       = process.env.GOOGLE_TOKEN_PATH       || './token.json';

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials file not found at ${credentialsPath}. ` +
      'Download it from the Google Cloud Console and run `node setup.js`.'
    );
  }
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Google OAuth token not found at ${tokenPath}. Run \`node setup.js\` to authorize.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf-8')));

  // Persist refreshed tokens automatically
  auth.on('tokens', tokens => {
    if (tokens.refresh_token) {
      const current = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      fs.writeFileSync(tokenPath, JSON.stringify({ ...current, ...tokens }));
    }
  });

  return google.sheets({ version: 'v4', auth });
}

// ─── Google Sheets: read existing business names ─────────────────────────────

async function readExistingNames(sheets) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!B2:B`, // column B = Business Name
  });

  const rows = result.data.values || [];
  return new Set(rows.flat().map(n => n.trim().toLowerCase()));
}

// ─── Google Sheets: append rows ──────────────────────────────────────────────

async function appendLeads(sheets, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank for manual entry
    '', // Notes  — left blank for manual entry
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

// ─── Email error notifications ────────────────────────────────────────────────
// Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env to enable.

async function sendErrorEmail(subject, body) {
  if (!process.env.SMTP_HOST) {
    console.error('[NOTIFY] Email not configured. Error details:', subject);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: CONFIG.notifyEmail,
      subject: `[HVAC Leads Workflow] ${subject}`,
      text: body,
    });

    console.log('  Error notification email sent to', CONFIG.notifyEmail);
  } catch (err) {
    console.error('  Failed to send notification email:', err.message);
  }
}

// ─── Main workflow ────────────────────────────────────────────────────────────

async function runWorkflow() {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] HVAC lead workflow starting...`);

  try {
    // 1. Search Apollo for HVAC contacts in SW Michigan
    if (!CONFIG.apolloApiKey) {
      throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
    }

    console.log('  [1/5] Searching Apollo.io...');
    const rawPeople = await searchApolloLeads();
    console.log(`        → ${rawPeople.length} raw results returned.`);

    if (rawPeople.length === 0) {
      const msg = 'Apollo returned 0 results. Verify API key, credits, and search filters.';
      console.warn('  WARNING:', msg);
      await sendErrorEmail('No Apollo results', `${ts}\n\n${msg}`);
      return;
    }

    // 2. Enrich contacts to reveal phone numbers (costs credits)
    console.log('  [2/5] Enriching contacts for phone numbers...');
    const enriched = await enrichPeopleForPhones(rawPeople);

    // 3. Map to lead objects; drop any without a phone number or business name
    console.log('  [3/5] Filtering leads...');
    const allLeads = (enriched.length > 0 ? enriched : rawPeople)
      .map(toLeadObject)
      .filter(lead => lead.phone && lead.businessName);

    console.log(`        → ${allLeads.length} leads with phone numbers.`);

    if (allLeads.length === 0) {
      const msg = 'No leads had phone numbers after enrichment. Consider broadening filters or checking Apollo credits.';
      console.warn('  WARNING:', msg);
      await sendErrorEmail('No leads with phone numbers', `${ts}\n\n${msg}`);
      return;
    }

    // 4. Connect to Google Sheets and read existing entries
    console.log('  [4/5] Connecting to Google Sheets...');
    const sheets = await getSheets();
    const existingNames = await readExistingNames(sheets);
    console.log(`        → ${existingNames.size} existing entries in sheet.`);

    // 5. Deduplicate, cap at maxLeadsPerRun, and append
    const newLeads = allLeads
      .filter(lead => !existingNames.has(lead.businessName.toLowerCase()))
      .slice(0, CONFIG.maxLeadsPerRun);

    console.log(`        → ${newLeads.length} new leads after deduplication.`);

    if (newLeads.length === 0) {
      console.log('  [5/5] All results already exist in the sheet. Nothing added.');
      return;
    }

    console.log('  [5/5] Appending to Google Sheet...');
    const added = await appendLeads(sheets, newLeads);

    console.log(`\n  ✓ Done. Added ${added} new leads.`);
    console.log(`  Sheet: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}`);

  } catch (err) {
    const msg = `Workflow failed at ${ts}:\n\n${err.message}\n\n${err.stack}`;
    console.error('\n  ERROR:', err.message);
    await sendErrorEmail('Workflow error', msg);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
// Default: 7:00 AM Eastern Time daily.
// node-cron timezone support handles DST automatically.
// Override with CRON_SCHEDULE env var (standard 5-field cron expression).

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

if (require.main === module) {
  const runNow = process.argv.includes('--run-now');

  if (runNow) {
    runWorkflow()
      .then(() => { console.log('\nDone.'); process.exit(0); })
      .catch(err => { console.error(err); process.exit(1); });
  } else {
    console.log('HVAC Lead Generation Workflow — Scheduler Mode');
    console.log(`  Schedule : ${CRON_SCHEDULE} America/New_York (7:00 AM ET daily)`);
    console.log(`  Sheet    : https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}`);
    console.log(`  Test run : node hvac-lead-workflow.js --run-now\n`);

    cron.schedule(CRON_SCHEDULE, runWorkflow, { timezone: 'America/New_York' });

    console.log('Scheduler is live. Waiting for 7:00 AM ET...');
  }
}

module.exports = { runWorkflow, CONFIG };
