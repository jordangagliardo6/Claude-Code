/**
 * Apollo.io → Google Sheets  |  SW Michigan HVAC Lead Generator
 *
 * What it does every run:
 *   1. Reads your Google Sheet to build a dedup list of existing businesses
 *   2. Searches Apollo for HVAC/plumbing/mechanical owners in SW Michigan
 *   3. Enriches results to surface phone numbers Apollo already has on file
 *   4. Filters out anyone without a phone number
 *   5. Skips businesses already in the sheet (by name)
 *   6. Appends up to MAX_LEADS_PER_RUN new rows with today's date
 *   7. Emails you (or logs) if Apollo returns nothing or the write fails
 *
 * To change target cities, edit TARGET_CITIES below.
 * To change job titles, edit TARGET_TITLES below.
 */

'use strict';

require('dotenv').config();

const axios      = require('axios');
const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');

// ─── Configuration ─────────────────────────────────────────────────────────────

const APOLLO_API_KEY   = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID   = process.env.GOOGLE_SPREADSHEET_ID || '1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI';
const SHEET_NAME       = process.env.GOOGLE_SHEET_NAME     || 'Sheet1';
const MAX_LEADS        = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const NOTIFY_EMAIL     = process.env.NOTIFICATION_EMAIL    || 'jgagliardo98@gmail.com';

// Edit this list to add/remove cities at any time
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Titles searched in Apollo, in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// NAICS prefix codes that cover HVAC / plumbing / mechanical contracting
//   23822 = Plumbing, Heating, and Air-Conditioning Contractors
//   23829 = Other Building Equipment Contractors (mechanical)
const NAICS_CODES = ['23822', '23829'];

// Google Sheets column order — mirrors what you see in the spreadsheet
const SHEET_COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B  ← dedup key
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank for you to fill)
  'Notes',            // I  (left blank for you to fill)
];

// Paths for Google OAuth / service-account credentials
const CREDENTIALS_DIR  = path.join(__dirname, 'credentials');
const SA_PATH          = path.join(CREDENTIALS_DIR, 'service-account.json');
const OAUTH_CREDS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json');
const TOKEN_PATH       = path.join(CREDENTIALS_DIR, 'token.json');

// ─── Logging ───────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
}

// ─── Apollo API ────────────────────────────────────────────────────────────────

/**
 * Search Apollo's people database for HVAC owners in SW Michigan.
 * Returns an array of raw Apollo person objects (no phones yet).
 */
async function apolloSearch() {
  const url = 'https://api.apollo.io/api/v1/mixed_people/api_search';

  const payload = {
    person_titles:                  TARGET_TITLES,
    person_seniorities:             ['owner', 'c_suite'],
    organization_num_employees_ranges: ['1,10', '11,25'],
    person_locations:               TARGET_CITIES,
    organization_naics_codes:       NAICS_CODES,
    q_organization_keyword_tags:    ['HVAC', 'heating', 'air conditioning', 'plumbing', 'mechanical contractor'],
    include_similar_titles:         true,
    per_page:                       Math.min(MAX_LEADS * 3, 100), // fetch extra; many will be filtered
    page:                           1,
  };

  const resp = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': APOLLO_API_KEY,
      'Cache-Control': 'no-cache',
    },
    timeout: 30_000,
  });

  return resp.data.people || [];
}

/**
 * Enrich a batch of people with Apollo bulk-match to surface any phones
 * Apollo already has on file (direct_phone, mobile_phone).
 *
 * Apollo limits bulk_match to 10 people per call, so we batch.
 * No async phone-reveal is triggered here — only existing database data.
 * This costs zero extra credits on most plans.
 */
async function apolloEnrich(people) {
  if (!people.length) return [];

  const BATCH = 10;
  const results = [];

  for (let i = 0; i < people.length; i += BATCH) {
    const slice = people.slice(i, i + BATCH);

    const details = slice.map(p => ({
      id:                p.id,
      first_name:        p.first_name,
      last_name:         p.last_name,
      organization_name: p.organization_name || p.organization?.name || '',
    }));

    try {
      const resp = await axios.post(
        'https://api.apollo.io/api/v1/people/bulk_match',
        { details },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': APOLLO_API_KEY,
          },
          timeout: 30_000,
        }
      );
      results.push(...(resp.data.matches || []));
    } catch (err) {
      log(`Enrichment batch ${Math.floor(i / BATCH) + 1} failed: ${err.response?.data?.error || err.message}`);
      // Keep going — push the un-enriched originals so they're not silently dropped
      results.push(...slice);
    }

    // Apollo asks for a small courtesy delay between bulk calls
    if (i + BATCH < people.length) await sleep(800);
  }

  return results;
}

// ─── Google Sheets ─────────────────────────────────────────────────────────────

async function getGoogleAuth() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

  // Prefer service account (simpler for cron jobs, no token expiry)
  if (fs.existsSync(SA_PATH)) {
    const auth = new google.auth.GoogleAuth({ keyFile: SA_PATH, scopes });
    return auth.getClient();
  }

  // Fall back to OAuth2 with stored token (run `node auth.js` once to create it)
  if (!fs.existsSync(OAUTH_CREDS_PATH)) {
    throw new Error(
      'No Google credentials found.\n' +
      'Option A (recommended): place a service-account.json in credentials/\n' +
      'Option B: place credentials.json in credentials/ and run `node auth.js`'
    );
  }

  const creds = JSON.parse(fs.readFileSync(OAUTH_CREDS_PATH));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const oAuth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('OAuth token missing. Run `node auth.js` once to authorize Google access.');
  }

  oAuth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
  return oAuth2;
}

/** Write the header row if the sheet is brand new (empty row 1). */
async function ensureHeaders(sheets) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:I1`,
  });

  if (!(resp.data.values || []).length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS] },
    });
    log('Header row written.');
  }
}

/** Read column B (Business Name) and return a lowercased Set for O(1) lookups. */
async function getExistingNames(sheets) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B:B`,
  });

  return new Set(
    (resp.data.values || [])
      .slice(1)                              // skip header
      .map(r => (r[0] || '').toLowerCase().trim())
      .filter(Boolean)
  );
}

/** Append new lead rows. */
async function appendLeads(sheets, leads) {
  if (!leads.length) return;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const rows = leads.map(l => [
    today,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website || '',
    '',   // Called — blank
    '',   // Notes  — blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId:   SPREADSHEET_ID,
    range:           `${SHEET_NAME}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody:     { values: rows },
  });
}

// ─── Data Helpers ──────────────────────────────────────────────────────────────

/** Pick the best available phone number from an Apollo person object. */
function pickPhone(p) {
  return (
    p.mobile_phone  ||
    p.direct_phone  ||
    p.phone_numbers?.[0]?.raw_number ||
    null
  );
}

/** Extract the raw city name from Apollo's location string. */
function pickCity(p) {
  const raw = p.present_raw_address || p.city || '';
  for (const entry of TARGET_CITIES) {
    const city = entry.split(',')[0];
    if (raw.toLowerCase().includes(city.toLowerCase())) return city;
  }
  if (p.city) return p.city;
  return raw.split(',')[0].trim() || 'Michigan';
}

/** Return a website URL if Apollo has one for the person's organization. */
function pickWebsite(p) {
  return p.organization?.website_url || p.website_url || '';
}

/** Convert a raw Apollo person object into a clean lead record. */
function toLead(p) {
  return {
    businessName: p.organization_name || p.organization?.name || '',
    firstName:    p.first_name || '',
    lastName:     p.last_name  || '',
    phone:        pickPhone(p),
    city:         pickCity(p),
    website:      pickWebsite(p),
  };
}

// ─── Error Notifications ───────────────────────────────────────────────────────

async function notifyError(subject, body) {
  log(`ERROR — ${subject}: ${body}`);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    log('(No SMTP configured — skipping email notification)');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from:    process.env.SMTP_USER,
      to:      NOTIFY_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text:    `${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });

    log(`Notification email sent to ${NOTIFY_EMAIL}`);
  } catch (emailErr) {
    log(`Failed to send notification email: ${emailErr.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  log('════════════════════════════════════════════════');
  log('  HVAC Lead Generation Run — SW Michigan');
  log('════════════════════════════════════════════════');

  if (!APOLLO_API_KEY) {
    await notifyError('Missing API Key', 'APOLLO_API_KEY is not set in environment.');
    process.exit(1);
  }

  // 1. Connect to Google Sheets
  log('Connecting to Google Sheets...');
  let sheets;
  try {
    const auth = await getGoogleAuth();
    sheets = google.sheets({ version: 'v4', auth });
    await ensureHeaders(sheets);
  } catch (err) {
    await notifyError('Google Auth Failed', err.message);
    process.exit(1);
  }

  // 2. Load existing business names for deduplication
  log('Loading existing leads for deduplication...');
  let existingNames;
  try {
    existingNames = await getExistingNames(sheets);
    log(`Dedup list loaded — ${existingNames.size} businesses already in sheet.`);
  } catch (err) {
    await notifyError('Google Sheets Read Failed', err.message);
    process.exit(1);
  }

  // 3. Search Apollo
  log('Searching Apollo.io...');
  let rawPeople = [];
  try {
    rawPeople = await apolloSearch();
    log(`Apollo returned ${rawPeople.length} candidates.`);
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    await notifyError('Apollo Search Failed', detail);
    process.exit(1);
  }

  if (!rawPeople.length) {
    await notifyError(
      'Apollo Returned No Results',
      'The SW Michigan HVAC search returned 0 people. Check your Apollo plan, API key, or filters.'
    );
    return;
  }

  // 4. Enrich to surface stored phone numbers
  log('Enriching contacts for phone numbers...');
  const enrichedPeople = await apolloEnrich(rawPeople);
  const allPeople = enrichedPeople.length ? enrichedPeople : rawPeople;

  // 5. Convert to leads, filter, and deduplicate
  const newLeads = allPeople
    .map(toLead)
    .filter(l => l.businessName)                              // must have a company name
    .filter(l => l.phone)                                     // must have a phone number
    .filter(l => !existingNames.has(l.businessName.toLowerCase().trim())) // not already in sheet
    .slice(0, MAX_LEADS);                                     // cap at daily max

  log(`${newLeads.length} new leads after phone filter + dedup (cap: ${MAX_LEADS}).`);

  if (!newLeads.length) {
    log('No new qualifying leads found this run — sheet is up to date.');
    return;
  }

  // 6. Write to Google Sheets
  log('Appending leads to Google Sheet...');
  try {
    await appendLeads(sheets, newLeads);
  } catch (err) {
    await notifyError('Google Sheets Write Failed', err.message);
    process.exit(1);
  }

  // 7. Summary
  log(`\n✓ Added ${newLeads.length} leads:`);
  newLeads.forEach((l, i) => {
    log(`  ${String(i + 1).padStart(2)}. ${l.businessName.padEnd(40)} ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`);
  });

  log('\n════════════════════════════════════════════════');
  log(`  Run complete — ${newLeads.length} leads added.`);
  log('════════════════════════════════════════════════\n');
}

// Entry point — also exported so scheduler.js can call it directly
run().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});

module.exports = { run };
