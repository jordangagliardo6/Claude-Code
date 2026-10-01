/**
 * HVAC Lead Generation — Southwest Michigan
 *
 * Runs daily at 7am Eastern via node-cron.
 * Pulls up to 25 new HVAC/plumbing owner contacts from Apollo.io,
 * de-duplicates against the master Google Sheet, and appends new rows.
 *
 * Usage:
 *   node index.js              — starts the scheduler (runs at 7am ET daily)
 *   node index.js --run-now    — runs immediately once (great for first-time testing)
 *
 * Requires: Apollo Basic plan ($49/mo) or higher for People Search.
 */

'use strict';

require('dotenv').config();

const cron    = require('node-cron');
const axios   = require('axios');
const { google } = require('googleapis');
const nodemailer  = require('nodemailer');
const fs      = require('fs');
const path    = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const APOLLO_API_KEY       = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID       = process.env.SPREADSHEET_ID || '1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs';
const SHEET_TAB            = 'Sheet1'; // change if your tab has a different name
const KEY_FILE             = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './google-credentials.json';
const NOTIFICATION_EMAIL   = process.env.NOTIFICATION_EMAIL;
const SMTP_USER            = process.env.SMTP_USER;
const SMTP_PASS            = process.env.SMTP_PASS;
const MAX_LEADS_PER_RUN    = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ─── Target criteria ─────────────────────────────────────────────────────────

// Modify this list freely to add/remove cities
const TARGET_CITIES = [
  'St. Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
  'Grand Haven', 'Muskegon', 'South Haven', 'Stevensville',
  'Portage', 'Berrien Springs', 'Niles', 'Watervliet',
  'Paw Paw', 'Coloma', 'Three Rivers', 'Mattawan', 'Zeeland'
];

// Apollo people-search location strings (used in the API call)
const APOLLO_LOCATIONS = TARGET_CITIES.map(c => `${c}, Michigan, United States`);

// Decision-maker titles in priority order (Owner is highest priority)
const TARGET_TITLES = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];

// SIC codes: 1711=Plumbing/Heating/AC, 7623=Refrigeration/AC Repair, 5075=Warm Air Heating Equip
const TARGET_SIC_CODES = ['1711', '7623', '5075'];

// ─── Google Sheets auth ───────────────────────────────────────────────────────

function getGoogleSheetsClient() {
  if (!fs.existsSync(path.resolve(KEY_FILE))) {
    throw new Error(`Google service account key not found at: ${KEY_FILE}\nSee .env.example for setup instructions.`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(KEY_FILE),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ─── Read existing business names to prevent duplicates ──────────────────────

async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    // Column B = Business Name; skip header row
    range: `${SHEET_TAB}!B2:B`,
  });
  const rows = res.data.values || [];
  // Normalize to lowercase + trim for fuzzy duplicate detection
  return new Set(rows.flat().map(name => (name || '').toLowerCase().trim()));
}

// ─── Apollo: search for HVAC owners ──────────────────────────────────────────

async function fetchApolloLeads(existingNames) {
  if (!APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in your .env file.');
  }

  const newLeads = [];
  let page = 1;

  // Keep paginating until we have MAX_LEADS_PER_RUN new leads or exhaust results
  while (newLeads.length < MAX_LEADS_PER_RUN) {
    const payload = {
      api_key: APOLLO_API_KEY,
      // Job title filters — Apollo will also include similar titles
      person_titles: TARGET_TITLES,
      // Person must be located in SW Michigan
      person_locations: APOLLO_LOCATIONS,
      // Company SIC codes cover HVAC, plumbing, mechanical
      organization_sic_codes: TARGET_SIC_CODES,
      // Owner-operated: 1–25 employees
      organization_num_employees_ranges: ['1,10', '11,25'],
      // Only return people who have at least one phone number on file
      contact_email_status: [], // no email filter — we care about phones
      per_page: 25,
      page,
    };

    let response;
    try {
      response = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      const status = err.response?.status;
      const msg    = err.response?.data?.message || err.message;

      if (status === 403 || (msg && msg.toLowerCase().includes('plan'))) {
        throw new Error(
          'Apollo plan limit reached.\n' +
          'People Search requires Apollo Basic ($49/mo) or higher.\n' +
          'Upgrade at: https://app.apollo.io/#/settings/plans/upgrade'
        );
      }
      throw new Error(`Apollo API error (HTTP ${status}): ${msg}`);
    }

    const people = response.data?.people || [];
    if (people.length === 0) break; // no more results

    for (const person of people) {
      if (newLeads.length >= MAX_LEADS_PER_RUN) break;

      // Skip anyone without a phone number
      const phone = selectBestPhone(person);
      if (!phone) continue;

      const businessName = person.organization?.name || '';
      if (!businessName) continue;

      // Duplicate check against existing sheet entries
      if (existingNames.has(businessName.toLowerCase().trim())) continue;
      // Also skip duplicates within this run's batch
      if (newLeads.some(l => l.businessName.toLowerCase().trim() === businessName.toLowerCase().trim())) continue;

      // Find the most senior title this person holds
      const title = pickBestTitle(person.title || '');

      newLeads.push({
        businessName,
        ownerFirstName : person.first_name || '',
        ownerLastName  : person.last_name  || '',
        phone,
        city           : extractCity(person),
        website        : person.organization?.website_url || person.organization?.primary_domain || '',
      });
    }

    // If Apollo returned fewer than per_page results, we've hit the end
    if (people.length < 25) break;
    page++;
  }

  return newLeads;
}

// Pick the best available phone: prefer mobile → direct → work → any
function selectBestPhone(person) {
  const phones = person.phone_numbers || [];

  const byType = type => phones.find(p => p.type === type && p.sanitized_number);
  const mobile = byType('mobile');
  if (mobile) return formatPhone(mobile.sanitized_number);

  const direct = byType('direct');
  if (direct) return formatPhone(direct.sanitized_number);

  const work = byType('work_hq');
  if (work) return formatPhone(work.sanitized_number);

  // Fall back to any non-null number
  const any = phones.find(p => p.sanitized_number);
  return any ? formatPhone(any.sanitized_number) : null;
}

// Format a 10-digit number as (269) 123-4567
function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    const d = digits.slice(1);
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return raw; // return as-is if format is unexpected
}

// Return the most senior matching title, or whatever Apollo gave us
function pickBestTitle(rawTitle) {
  for (const t of TARGET_TITLES) {
    if (rawTitle.toLowerCase().includes(t.toLowerCase())) return t;
  }
  return rawTitle;
}

// Extract a clean city name from Apollo's person location data
function extractCity(person) {
  // Apollo returns city on the person object or their organization
  if (person.city) return person.city;
  if (person.organization?.city) return person.organization.city;

  // Fall back: parse from location string "City, State, Country"
  const loc = person.location || person.organization?.location || '';
  const parts = loc.split(',');
  return parts[0]?.trim() || '';
}

// ─── Google Sheets: append new leads ─────────────────────────────────────────

async function appendLeadsToSheet(sheets, leads) {
  if (leads.length === 0) return;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Map each lead to a row matching the sheet columns:
  // Date Added | Business Name | Owner First | Owner Last | Phone | City | Website | Called | Notes
  const rows = leads.map(l => [
    today,
    l.businessName,
    l.ownerFirstName,
    l.ownerLastName,
    l.phone,
    l.city,
    l.website,
    '', // Called — left blank
    '', // Notes — left blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Email alert on failure ───────────────────────────────────────────────────

async function sendErrorEmail(subject, body) {
  if (!SMTP_USER || !SMTP_PASS || !NOTIFICATION_EMAIL) {
    console.error('[EMAIL] SMTP not configured — skipping email alert.');
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: SMTP_USER,
      to: NOTIFICATION_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });
    console.log(`[EMAIL] Alert sent to ${NOTIFICATION_EMAIL}`);
  } catch (err) {
    console.error('[EMAIL] Failed to send alert:', err.message);
  }
}

// ─── Main workflow ────────────────────────────────────────────────────────────

async function runWorkflow() {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n[${timestamp} ET] Starting HVAC lead generation run...`);

  let sheets;
  try {
    sheets = getGoogleSheetsClient();
  } catch (err) {
    const msg = `Google Sheets connection failed: ${err.message}`;
    console.error(`[ERROR] ${msg}`);
    await sendErrorEmail('Google Sheets connection failed', msg);
    return;
  }

  // Step 1: Read existing entries to avoid duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`[INFO] ${existingNames.size} existing businesses loaded for duplicate check.`);
  } catch (err) {
    const msg = `Failed to read Google Sheet: ${err.message}`;
    console.error(`[ERROR] ${msg}`);
    await sendErrorEmail('Google Sheets read failed', msg);
    return;
  }

  // Step 2: Pull new leads from Apollo
  let newLeads;
  try {
    newLeads = await fetchApolloLeads(existingNames);
    console.log(`[INFO] Apollo returned ${newLeads.length} new leads after deduplication.`);
  } catch (err) {
    const msg = `Apollo API error: ${err.message}`;
    console.error(`[ERROR] ${msg}`);
    await sendErrorEmail('Apollo API error', `${msg}\n\nPlease check manually.`);
    return;
  }

  if (newLeads.length === 0) {
    console.log('[INFO] No new leads found this run. All results were duplicates or lacked phone numbers.');
    return;
  }

  // Step 3: Append to Google Sheet
  try {
    await appendLeadsToSheet(sheets, newLeads);
    console.log(`[SUCCESS] Appended ${newLeads.length} new leads to the sheet.`);
    // Print a quick summary
    newLeads.forEach(l => {
      console.log(`  + ${l.businessName} | ${l.ownerFirstName} ${l.ownerLastName} | ${l.phone} | ${l.city}`);
    });
  } catch (err) {
    const msg = `Failed to write to Google Sheet: ${err.message}`;
    console.error(`[ERROR] ${msg}`);
    await sendErrorEmail('Google Sheets write failed', `${msg}\n\nLeads that failed to save:\n${JSON.stringify(newLeads, null, 2)}`);
  }
}

// ─── Connection test ──────────────────────────────────────────────────────────
// Run this once before the scheduler kicks in to verify both APIs work.

async function testConnections() {
  console.log('\n── Connection Test ──────────────────────────────────────────');

  // Test Google Sheets
  try {
    const sheets = getGoogleSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log(`[✓] Google Sheets: connected to "${meta.data.properties.title}"`);
    console.log(`    URL: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  } catch (err) {
    console.error(`[✗] Google Sheets: ${err.message}`);
    console.error('    → Make sure the service account JSON is correct and the sheet is shared with it.');
    process.exit(1);
  }

  // Test Apollo (a lightweight ping — checks key validity without consuming lead credits)
  try {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set in .env');
    const res = await axios.get(
      `https://api.apollo.io/api/v1/users/api_profile?api_key=${APOLLO_API_KEY}`
    );
    const user = res.data?.user;
    console.log(`[✓] Apollo.io: connected as "${user?.email || 'unknown'}" (plan: ${user?.organization?.plan_type || 'unknown'})`);
    if (user?.organization?.plan_type === 'free') {
      console.warn('    ⚠  WARNING: Your Apollo plan is "free". People Search requires Basic ($49/mo) or higher.');
      console.warn('       Upgrade at: https://app.apollo.io/#/settings/plans/upgrade');
    }
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) {
      console.error('[✗] Apollo.io: Invalid API key. Check APOLLO_API_KEY in .env');
    } else {
      console.error(`[✗] Apollo.io: ${err.message}`);
    }
    process.exit(1);
  }

  console.log('\n── All connections OK. Scheduler will start. ────────────────\n');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const RUN_NOW = process.argv.includes('--run-now');

(async () => {
  await testConnections();

  if (RUN_NOW) {
    // Immediate single run — useful for first-time setup verification
    await runWorkflow();
    process.exit(0);
  }

  // Schedule: 7:00am Eastern (cron uses server local time unless TZ env is set)
  // Set TZ=America/New_York in your environment or in the cron invocation
  console.log('[SCHEDULER] Running daily at 7:00am Eastern. Press Ctrl+C to stop.');
  cron.schedule('0 7 * * *', runWorkflow, {
    timezone: 'America/New_York',
  });
})();
