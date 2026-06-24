'use strict';

/**
 * HVAC Lead Generation — Southwest Michigan
 *
 * Searches Apollo.io for owner-operated HVAC/plumbing businesses in SW Michigan,
 * appends new leads to a Google Sheet, and skips duplicates.
 * Runs automatically every day at 7:00 AM Eastern Time via node-cron.
 *
 * Usage:
 *   node leadgen.js              → starts the scheduler (7am ET daily)
 *   node leadgen.js --run-now   → runs once immediately, then starts scheduler
 */

require('dotenv').config();

const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');

// =============================================================================
// CONFIGURATION
// Edit this block to change cities, columns, limits, or email.
// =============================================================================
const CONFIG = {
  // Target cities in Southwest Michigan — add or remove freely
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Industry keyword tags sent to Apollo
  industryKeywords: [
    'HVAC',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
    'heating',
    'cooling',
  ],

  // NAICS code 238220 = Plumbing, Heating & Air-Conditioning Contractors
  naicsCodes: ['238220'],

  // Job titles to target, in descending priority order
  // Apollo returns any title match; we rank during post-processing.
  jobTitlePriority: ['owner', 'president', 'founder', 'co-founder', 'co founder', 'general manager'],

  // Apollo employee-count range for owner-operated businesses
  employeeRange: '1,25',

  // Maximum new rows added per scheduled run
  maxLeadsPerRun: 25,

  // ── Google Sheet ──────────────────────────────────────────────────────────
  // ID from the spreadsheet URL: .../spreadsheets/d/<THIS_ID>/edit
  spreadsheetId: '1Wm5m8AWGeZJDdBnHNxtd0SosrrEH_aQrzZmYUXnTMoE',
  sheetName: 'Sheet1',

  // Column layout — must match the actual header row in the sheet
  // A: Date Added  B: Business Name  C: First Name  D: Last Name
  // E: Phone  F: City  G: Website  H: Called  I: Notes
  appendRange: 'Sheet1!A:I',

  // ── Notifications ─────────────────────────────────────────────────────────
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',
};

// =============================================================================
// APOLLO.IO — PEOPLE SEARCH
// =============================================================================

/**
 * Returns a score 0-4 for a job title string; lower = higher priority.
 * Used to pick the best contact when multiple people exist at one company.
 */
function titlePriority(title = '') {
  const t = title.toLowerCase();
  for (let i = 0; i < CONFIG.jobTitlePriority.length; i++) {
    if (t.includes(CONFIG.jobTitlePriority[i])) return i;
  }
  return CONFIG.jobTitlePriority.length; // lowest priority — still include
}

/**
 * Pulls the best available phone number from an Apollo person record.
 * Priority: direct_phone > mobile_phone > sanitized_phone > phone_numbers array.
 */
function extractPhone(person) {
  if (person.direct_phone) return person.direct_phone;
  if (person.mobile_phone) return person.mobile_phone;
  if (person.sanitized_phone) return person.sanitized_phone;

  const numbers = person.phone_numbers || [];
  if (numbers.length === 0) return null;

  const byType = type => numbers.find(p => p.type === type);
  const best = byType('mobile') || byType('direct') || numbers[0];
  return best?.sanitized_number || best?.raw_number || null;
}

/**
 * Searches Apollo for HVAC decision-makers across all configured cities.
 * Returns raw Apollo person objects.
 */
async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': apiKey,
  };

  const allPeople = [];
  // Fetch a 2× buffer so deduplication still leaves enough leads
  const targetBuffer = CONFIG.maxLeadsPerRun * 2;

  for (const city of CONFIG.cities) {
    if (allPeople.length >= targetBuffer) break;

    const payload = {
      person_titles: [
        'Owner',
        'President',
        'Founder',
        'Co-Founder',
        'General Manager',
      ],
      q_organization_keyword_tags: CONFIG.industryKeywords,
      organization_naics_codes: CONFIG.naicsCodes,
      organization_locations: [city],
      organization_num_employees_ranges: [CONFIG.employeeRange],
      per_page: 25,
      page: 1,
    };

    try {
      const response = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        payload,
        { headers }
      );

      const people = response.data?.people || [];
      console.log(`  [Apollo] ${city}: ${people.length} result(s)`);
      allPeople.push(...people);

      // Respect Apollo rate limits
      await sleep(500);
    } catch (err) {
      const detail = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.warn(`  [Apollo] Warning — ${city}: ${detail}`);
      // Continue to next city rather than aborting
    }
  }

  return allPeople;
}

/**
 * Converts raw Apollo records into flat lead objects ready for the sheet.
 * Deduplicates within the batch (one contact per company, highest title priority).
 */
function normalizeLeads(apolloPeople) {
  // Map org name → best person so far
  const byCompany = new Map();

  for (const person of apolloPeople) {
    const org = person.organization || {};
    const businessName = (org.name || person.organization_name || '').trim();
    if (!businessName) continue;

    const phone = extractPhone(person);
    if (!phone) continue; // skip contacts with no phone

    const priority = titlePriority(person.title);
    const existing = byCompany.get(businessName.toLowerCase());

    if (!existing || priority < existing.priority) {
      byCompany.set(businessName.toLowerCase(), {
        priority,
        dateAdded: new Date().toLocaleDateString('en-US'),
        businessName,
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        phone,
        city: person.city || org.city || '',
        website: org.website_url || person.website_url || '',
      });
    }
  }

  return [...byCompany.values()];
}

// =============================================================================
// GOOGLE SHEETS
// =============================================================================

/**
 * Builds an authenticated Google Sheets client.
 * Reads credentials from GOOGLE_SERVICE_ACCOUNT_JSON env var or credentials.json file.
 */
async function getGoogleSheetsClient() {
  let authConfig;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    authConfig = {
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    };
  } else if (fs.existsSync('./credentials.json')) {
    authConfig = {
      keyFile: './credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    };
  } else {
    throw new Error(
      'Google credentials not found. ' +
      'Set the GOOGLE_SERVICE_ACCOUNT_JSON env var or place credentials.json in this directory. ' +
      'See SETUP.md for instructions.'
    );
  }

  const auth = new google.auth.GoogleAuth(authConfig);
  return google.sheets({ version: 'v4', auth });
}

/**
 * Returns a Set of normalized business names already in column B (rows 2+).
 * Used to prevent duplicate entries.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!B:B`,
  });

  const rows = res.data.values || [];
  return new Set(
    rows
      .slice(1) // skip header row
      .map(r => (r[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Appends lead rows to the sheet in the correct column order:
 * A: Date Added | B: Business Name | C: First | D: Last | E: Phone
 * F: City | G: Website | H: Called (blank) | I: Notes (blank)
 */
async function appendLeadsToSheet(sheets, leads) {
  if (leads.length === 0) return;

  const rows = leads.map(l => [
    l.dateAdded,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website,
    '', // Called — left blank for manual entry
    '', // Notes — left blank for manual entry
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: CONFIG.appendRange,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// =============================================================================
// ERROR NOTIFICATIONS
// =============================================================================

/**
 * Sends an error notification email via Gmail (or any SMTP provider).
 * Requires SMTP_USER and SMTP_PASS environment variables.
 * Uses a Gmail App Password — see SETUP.md.
 */
async function sendErrorNotification(subject, body) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Notify] SMTP_USER/SMTP_PASS not set — skipping email alert.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: CONFIG.notificationEmail,
      subject,
      text: body,
    });

    console.log(`[Notify] Alert sent to ${CONFIG.notificationEmail}`);
  } catch (err) {
    console.error('[Notify] Failed to send email:', err.message);
  }
}

// =============================================================================
// MAIN RUN FUNCTION
// =============================================================================

async function runLeadGen() {
  const runId = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${runId}] Starting lead generation run`);
  console.log('='.repeat(60));

  try {
    // ── Step 1: Search Apollo ────────────────────────────────────────────────
    console.log('\n[Step 1/5] Searching Apollo.io for HVAC contacts...');
    const apolloPeople = await searchApolloLeads();

    if (apolloPeople.length === 0) {
      const msg =
        'Apollo returned 0 results across all cities. ' +
        'Check that APOLLO_API_KEY is valid and the account has search credits.';
      console.warn('[Warning]', msg);
      await sendErrorNotification('[Lead Gen] Apollo returned 0 results', msg);
      return;
    }
    console.log(`[Step 1/5] Total raw results: ${apolloPeople.length}`);

    // ── Step 2: Normalize + filter ───────────────────────────────────────────
    console.log('\n[Step 2/5] Normalizing leads and filtering phone-less contacts...');
    const candidates = normalizeLeads(apolloPeople);
    console.log(`[Step 2/5] ${candidates.length} unique companies with phone numbers`);

    if (candidates.length === 0) {
      const msg =
        'Apollo returned results but none had phone numbers. ' +
        'Your Apollo plan may require phone-unlock credits for the People Search endpoint. ' +
        'Consider upgrading to Basic ($49/mo) which includes 1,000 phone unlocks/month.';
      console.warn('[Warning]', msg);
      await sendErrorNotification('[Lead Gen] No phone numbers in Apollo results', msg);
      return;
    }

    // ── Step 3: Connect to Google Sheets ─────────────────────────────────────
    console.log('\n[Step 3/5] Connecting to Google Sheets...');
    const sheets = await getGoogleSheetsClient();

    const existingNames = await getExistingBusinessNames(sheets);
    console.log(`[Step 3/5] ${existingNames.size} existing businesses in sheet`);

    // ── Step 4: Deduplicate ───────────────────────────────────────────────────
    console.log('\n[Step 4/5] Checking for duplicates...');
    const newLeads = candidates
      .filter(l => !existingNames.has(l.businessName.trim().toLowerCase()))
      .slice(0, CONFIG.maxLeadsPerRun);

    if (newLeads.length === 0) {
      console.log('[Step 4/5] All results already exist in the sheet — nothing to add.');
      return;
    }
    console.log(`[Step 4/5] ${newLeads.length} new leads after deduplication`);

    // ── Step 5: Append to sheet ───────────────────────────────────────────────
    console.log('\n[Step 5/5] Appending to Google Sheet...');
    await appendLeadsToSheet(sheets, newLeads);

    console.log(`\n✓ Done — added ${newLeads.length} lead(s):`);
    newLeads.forEach((l, i) => {
      console.log(
        `  ${String(i + 1).padStart(2)}. ${l.businessName.padEnd(35)} ` +
        `${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`
      );
    });

  } catch (err) {
    const errorText = err.stack || err.message;
    console.error('\n[Error]', errorText);
    await sendErrorNotification(
      '[Lead Gen] Run failed — manual check required',
      `The lead generation workflow failed at ${runId}:\n\n${errorText}\n\n` +
      'Please check the logs and retry with: node leadgen.js --run-now'
    );
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

// =============================================================================
// UTILITIES
// =============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// SCHEDULER + ENTRY POINT
// =============================================================================

// Run at 7:00 AM Eastern Time every day (handles EST/EDT automatically)
const schedule = cron.schedule('0 7 * * *', runLeadGen, {
  timezone: 'America/New_York',
  scheduled: true,
});

console.log('────────────────────────────────────────────────────────────');
console.log('  HVAC Lead Gen — Southwest Michigan');
console.log('────────────────────────────────────────────────────────────');
console.log('  Schedule : Daily at 7:00 AM Eastern Time');
console.log('  Sheet ID :', CONFIG.spreadsheetId);
console.log('  Cities   :', CONFIG.cities.length, 'targets');
console.log('  Max leads:', CONFIG.maxLeadsPerRun, 'per run');
console.log('────────────────────────────────────────────────────────────');
console.log('  Scheduler is running. Press Ctrl+C to stop.');
console.log('  Use --run-now flag to trigger an immediate run.');
console.log('────────────────────────────────────────────────────────────\n');

// Immediate run when --run-now is passed (for testing or manual trigger)
if (process.argv.includes('--run-now')) {
  console.log('--run-now flag detected. Executing immediately...\n');
  runLeadGen();
}
