'use strict';

// Load .env before anything else
require('dotenv').config();

const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Edit this object to change cities, job titles, search limits, etc.
const CONFIG = {
  // Max new leads to add per scheduled run (keeps your list manageable)
  maxLeadsPerRun: 25,

  // Google Sheet settings
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  sheetName: process.env.SHEET_TAB_NAME || 'Sheet1',

  // Error notification recipient
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',

  // Target cities — add or remove to expand/shrink the search area
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Job titles searched in priority order — Owner is most valuable, GM is fallback
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Apollo company size: 1–25 employees (owner-operated small businesses)
  employeeRange: '1,25',

  // Industry keyword tags sent to Apollo
  industryKeywords: ['hvac', 'heating', 'air conditioning', 'plumbing', 'mechanical contracting'],

  // Cron expression — timezone is locked to America/New_York in the scheduler call
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
};

// Column map (0-indexed) matching the spreadsheet header row:
// Date Added | Business Name | Owner First | Owner Last | Phone | City | Website | Called | Notes
const COL = {
  dateAdded: 0,
  businessName: 1,
  firstName: 2,
  lastName: 3,
  phone: 4,
  city: 5,
  website: 6,
  called: 7,
  notes: 8,
};

// ─── LOGGING ──────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── GOOGLE SHEETS CLIENT ─────────────────────────────────────────────────────
function getSheetsClient() {
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './google-credentials.json';
  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ─── READ EXISTING BUSINESS NAMES (for dedup check) ──────────────────────────
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    // Read only column B (Business Name) — cheap, no matter how big the sheet gets
    range: `${CONFIG.sheetName}!B:B`,
  });

  const rows = res.data.values || [];
  // Row 0 is the header — skip it; normalize to lowercase for case-insensitive comparison
  return new Set(
    rows.slice(1).map(r => (r[0] || '').toLowerCase().trim()).filter(Boolean)
  );
}

// ─── APPEND NEW LEADS TO SHEET ────────────────────────────────────────────────
async function appendLeads(sheets, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

  const rows = leads.map(lead => {
    const row = new Array(Object.keys(COL).length).fill('');
    row[COL.dateAdded]    = today;
    row[COL.businessName] = lead.businessName;
    row[COL.firstName]    = lead.firstName;
    row[COL.lastName]     = lead.lastName;
    row[COL.phone]        = lead.phone;
    row[COL.city]         = lead.city;
    row[COL.website]      = lead.website;
    // Called and Notes stay blank — filled in manually
    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─── APOLLO PEOPLE SEARCH ─────────────────────────────────────────────────────
// Searches by each job title in priority order. Stops once we have enough candidates.
async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  const collected = [];
  // Fetch 3x the max to give room for dedup and phone-number filtering
  const targetBuffer = CONFIG.maxLeadsPerRun * 3;

  for (const title of CONFIG.jobTitles) {
    if (collected.length >= targetBuffer) break;

    try {
      const response = await axios.post(
        'https://api.apollo.io/v1/mixed_people/search',
        {
          api_key: apiKey,
          person_titles: [title],
          person_locations: CONFIG.cities,
          organization_num_employees_ranges: [CONFIG.employeeRange],
          q_organization_keyword_tags: CONFIG.industryKeywords,
          // Ask Apollo to reveal phone numbers (requires Basic plan or higher)
          reveal_phone_number: true,
          page: 1,
          per_page: 50,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );

      const people = response.data?.people || [];
      log(`Apollo → title "${title}": ${people.length} result(s)`);
      collected.push(...people);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message;
      // Log and continue to next title rather than aborting the whole run
      log(`[WARN] Apollo search failed for title "${title}": [${status || 'ERR'}] ${msg}`);
    }
  }

  return collected;
}

// ─── PARSE A RAW APOLLO PERSON INTO A CLEAN LEAD OBJECT ──────────────────────
function parseLead(person) {
  const org = person.organization || {};

  // Prefer mobile > direct > org phone — take the first non-null number found
  const phone =
    person.mobile_phone ||
    (person.phone_numbers || []).find(p => p?.sanitized_number)?.sanitized_number ||
    org.sanitized_phone ||
    null;

  // No phone = skip (per your requirement)
  if (!phone) return null;

  // Normalize city to "City, MI" format
  const rawCity = person.city || org.city || '';
  const rawState = person.state || org.state || '';
  let city = rawCity;
  if (rawCity && rawState) {
    const stateAbbr = rawState.length === 2 ? rawState : 'MI';
    city = `${rawCity}, ${stateAbbr}`;
  }

  return {
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1'), // strip to 10 digits
    city: city,
    website: org.website_url || '',
  };
}

// ─── ERROR NOTIFICATION ───────────────────────────────────────────────────────
async function notifyError(error) {
  const subject = 'HVAC Lead Gen – Error Alert';
  const body = [
    `Time: ${new Date().toISOString()}`,
    `Error: ${error instanceof Error ? error.message : error}`,
    error instanceof Error && error.stack ? `\nStack:\n${error.stack}` : '',
  ].join('\n');

  log(`[ERROR] ${body}`);

  // Email alert — only fires if GMAIL_APP_PASSWORD is set in .env
  if (!process.env.GMAIL_APP_PASSWORD) return;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_SENDER || CONFIG.notificationEmail,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    await transporter.sendMail({
      from: process.env.GMAIL_SENDER || CONFIG.notificationEmail,
      to: CONFIG.notificationEmail,
      subject,
      text: body,
    });
    log(`[NOTIFY] Error email sent to ${CONFIG.notificationEmail}`);
  } catch (emailErr) {
    log(`[WARN] Could not send error email: ${emailErr.message}`);
  }
}

// ─── MAIN WORKFLOW ────────────────────────────────────────────────────────────
async function runWorkflow() {
  log('═══════ HVAC Lead Generation Run Started ═══════');

  try {
    const sheets = getSheetsClient();

    // Step 1: Load existing business names from the sheet
    log('Step 1/4 — Reading existing leads from Google Sheets...');
    const existingNames = await getExistingBusinessNames(sheets);
    log(`         Found ${existingNames.size} existing business(es) in sheet.`);

    // Step 2: Search Apollo for HVAC leads in SW Michigan
    log('Step 2/4 — Searching Apollo.io for HVAC contacts...');
    const rawPeople = await searchApolloLeads();
    log(`         Apollo returned ${rawPeople.length} raw result(s) across all titles.`);

    if (rawPeople.length === 0) {
      await notifyError(
        'Apollo.io returned 0 results. Possible causes: API key issue, plan limits, or no matching contacts. Check your Apollo account.'
      );
      return;
    }

    // Step 3: Parse, filter (require phone), and deduplicate
    log('Step 3/4 — Filtering: requiring phone numbers and removing duplicates...');
    const seenThisRun = new Set();
    const newLeads = [];

    for (const person of rawPeople) {
      if (newLeads.length >= CONFIG.maxLeadsPerRun) break;

      const lead = parseLead(person);
      if (!lead || !lead.businessName) continue;

      const key = lead.businessName.toLowerCase().trim();
      if (existingNames.has(key)) continue;   // already in sheet
      if (seenThisRun.has(key)) continue;     // duplicate in this batch

      seenThisRun.add(key);
      newLeads.push(lead);
    }

    const skippedNophone = rawPeople.length - [...rawPeople].filter(p => parseLead(p)).length;
    const skippedDupe = rawPeople.length - skippedNophone - newLeads.length;
    log(`         ${newLeads.length} new lead(s) | ${skippedNophone} skipped (no phone) | ${skippedDupe} skipped (duplicate)`);

    if (newLeads.length === 0) {
      log('         No new leads this run — all results were duplicates or lacked phone numbers.');
      log('═══════ Run Complete (0 leads added) ═══════');
      return;
    }

    // Step 4: Append to Google Sheets
    log(`Step 4/4 — Appending ${newLeads.length} lead(s) to Google Sheets...`);
    const added = await appendLeads(sheets, newLeads);
    log(`         ✓ ${added} lead(s) added successfully.`);

    // Print a summary to the console for easy reviewing
    log('\nLeads added this run:');
    newLeads.forEach((l, i) => {
      log(`  ${i + 1}. ${l.businessName} — ${l.firstName} ${l.lastName} — ${l.phone} — ${l.city}`);
    });

  } catch (err) {
    await notifyError(err);
  }

  log('═══════ Run Complete ═══════');
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
if (process.argv.includes('--run-once')) {
  // Immediate single run — useful for testing and manual pulls
  runWorkflow().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  // Scheduled daily mode
  const schedule = CONFIG.cronSchedule;
  log(`Scheduler ready. Cron: "${schedule}" | Timezone: America/New_York`);
  log('Waiting for 7am Eastern... Use "node leads-workflow.js --run-once" to run immediately.');

  cron.schedule(schedule, runWorkflow, {
    timezone: 'America/New_York',
  });
}
