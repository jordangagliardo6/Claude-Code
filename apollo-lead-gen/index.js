'use strict';

/**
 * apollo-lead-gen/index.js
 *
 * Searches Apollo.io every morning at 7 AM Eastern for owner-operated HVAC /
 * plumbing companies in Southwest Michigan and appends new leads — up to 25
 * per run — to a Google Sheet, skipping any business already present.
 *
 * Environment variables (see .env.example):
 *   APOLLO_API_KEY, GOOGLE_SPREADSHEET_ID, SHEET_NAME,
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH | GOOGLE_SERVICE_ACCOUNT_JSON,
 *   RUN_NOW, MAX_LEADS_PER_RUN, ERROR_LOG_PATH
 */

require('dotenv').config();

const axios     = require('axios');
const cron      = require('node-cron');
const { google } = require('googleapis');
const fs        = require('fs');
const path      = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_LEADS   = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const SHEET_ID    = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME  = process.env.SHEET_NAME || 'Sheet1';
const ERROR_LOG   = process.env.ERROR_LOG_PATH || path.join(__dirname, 'error.log');

// Edit this list any time to change which cities are searched.
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Apollo keyword tags that map to HVAC / plumbing / mechanical industries.
// Add or remove tags here without touching anything else.
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// Titles are searched in priority order; Apollo ranks matches at the top.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── Apollo helpers ───────────────────────────────────────────────────────────

/**
 * Search Apollo for people matching our HVAC / SW-Michigan criteria.
 * Returns the raw Apollo response object.
 */
async function searchApollo(page = 1) {
  const locationStrings = TARGET_CITIES.map(
    (city) => `${city}, Michigan, United States`
  );

  const body = {
    // Industry keywords applied to the person's organisation
    q_organization_keyword_tags: TARGET_INDUSTRIES,

    // Job title filter (priority order is preserved by Apollo's ranking)
    person_titles: TARGET_TITLES,

    // Bias results toward SW Michigan cities; Apollo accepts free-form strings
    person_locations: locationStrings,

    // Broad Michigan fallback so results aren't empty if a city tag misses
    organization_locations: ['Michigan, United States'],

    // Owner-operated small businesses only
    organization_num_employees_ranges: ['1,25'],

    // Only return contacts that have at least one verified phone number
    contact_phone_status: ['likely_to_be_valid', 'verified'],

    page,
    per_page: MAX_LEADS * 2, // Fetch extra to compensate for dedup drops
  };

  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    body,
    {
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key':     process.env.APOLLO_API_KEY,
      },
      timeout: 30_000,
    }
  );

  return response.data;
}

/**
 * Pick the best phone number from a contact object.
 * Prefers mobile/direct over raw org phone.
 */
function extractPhone(contact) {
  const numbers = contact.phone_numbers || [];
  if (numbers.length > 0) {
    const preferred = numbers.find(
      (p) => p.type === 'mobile' || p.type === 'direct'
    );
    return (preferred ?? numbers[0]).sanitized_number ?? null;
  }
  // Fallback: organisation main line
  return contact.organization?.phone ?? null;
}

/** Pull city from the person's record, then fall back to their org. */
function extractCity(contact) {
  return contact.city || contact.organization?.city || '';
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

/** Build an authenticated Google Sheets client from env credentials. */
function buildSheetsClient() {
  let auth;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON or ' +
      'GOOGLE_SERVICE_ACCOUNT_KEY_PATH in your .env file.'
    );
  }

  return google.sheets({ version: 'v4', auth });
}

/** Write the header row if column A row 1 is empty. */
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range:         `${SHEET_NAME}!A1`,
  });

  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId:     SHEET_ID,
      range:             `${SHEET_NAME}!A1:I1`,
      valueInputOption:  'USER_ENTERED',
      requestBody: {
        values: [[
          'Date Added',
          'Business Name',
          'Owner First Name',
          'Owner Last Name',
          'Phone Number',
          'City',
          'Website',
          'Called',   // intentionally blank per request
          'Notes',    // intentionally blank per request
        ]],
      },
    });
    log('Header row written to sheet.');
  }
}

/**
 * Read column B (Business Name) and return a lowercase Set for fast dedup.
 * Skips the header row.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range:         `${SHEET_NAME}!B:B`,
  });

  const rows = res.data.values ?? [];
  return new Set(
    rows
      .slice(1) // skip header
      .map((row) => row[0]?.toLowerCase().trim())
      .filter(Boolean)
  );
}

/** Append an array of lead objects as new rows. */
async function appendLeads(sheets, leads) {
  const today = new Date().toLocaleDateString('en-US');
  const rows  = leads.map((lead) => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called
    '', // Notes
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId:    SHEET_ID,
    range:            `${SHEET_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: rows },
  });
}

// ─── Orchestration ────────────────────────────────────────────────────────────

async function runLeadGen() {
  log('=== Lead generation run starting ===');

  // ── Step 1: Apollo search ──────────────────────────────────────────────────
  let apolloData;
  try {
    apolloData = await searchApollo(1);
  } catch (err) {
    handleError(
      `Apollo search failed: ${err.response?.data?.message ?? err.message}`
    );
    return;
  }

  // Apollo returns results under `contacts` for people searches
  const rawContacts = apolloData.contacts ?? apolloData.people ?? [];
  log(`Apollo returned ${rawContacts.length} raw contacts.`);

  if (rawContacts.length === 0) {
    handleError(
      'Apollo returned 0 contacts. Check API key, rate limits, or loosen search filters.'
    );
    return;
  }

  // ── Step 2: Google Sheets connection ───────────────────────────────────────
  let sheets;
  try {
    sheets = buildSheetsClient();
    await ensureHeaders(sheets);
  } catch (err) {
    handleError(`Google Sheets setup failed: ${err.message}`);
    return;
  }

  // ── Step 3: Read existing names ────────────────────────────────────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    log(`Sheet already contains ${existingNames.size} business(es).`);
  } catch (err) {
    handleError(`Could not read existing sheet data: ${err.message}`);
    return;
  }

  // ── Step 4: Filter, deduplicate, transform ─────────────────────────────────
  const newLeads = [];

  for (const contact of rawContacts) {
    if (newLeads.length >= MAX_LEADS) break;

    const phone = extractPhone(contact);
    if (!phone) continue;

    const businessName = (contact.organization?.name ?? contact.company ?? '').trim();
    if (!businessName) continue;

    const key = businessName.toLowerCase();
    if (existingNames.has(key)) {
      log(`  Skip (duplicate): ${businessName}`);
      continue;
    }

    const city = extractCity(contact);
    const isTargetCity = TARGET_CITIES.some(
      (tc) => city.toLowerCase().includes(tc.toLowerCase())
    );

    newLeads.push({
      businessName,
      firstName:  contact.first_name ?? '',
      lastName:   contact.last_name  ?? '',
      phone,
      city,
      website:    contact.organization?.website_url ?? contact.website_url ?? '',
      isTargetCity,
    });

    existingNames.add(key); // Block intra-run duplicates
  }

  // Surface SW Michigan cities first
  newLeads.sort((a, b) => Number(b.isTargetCity) - Number(a.isTargetCity));

  if (newLeads.length === 0) {
    log('No new leads found this run — all results were duplicates or lacked phone numbers.');
    return;
  }

  // ── Step 5: Write to sheet ─────────────────────────────────────────────────
  try {
    await appendLeads(sheets, newLeads);
    log(`SUCCESS: Added ${newLeads.length} new lead(s) to Google Sheets.`);
    newLeads.forEach((l) =>
      log(`  + ${l.businessName} | ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`)
    );
  } catch (err) {
    handleError(`Google Sheets write failed: ${err.message}`);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function handleError(message) {
  const entry = `[${new Date().toISOString()}] ERROR: ${message}`;
  console.error(entry);
  try {
    fs.appendFileSync(ERROR_LOG, entry + '\n');
  } catch (_) {
    // If we can't write the log, at least the console already has it.
  }
}

// ─── Entry points ─────────────────────────────────────────────────────────────

// Immediate run triggered by RUN_NOW=true (used by `npm run run-now`)
if (process.env.RUN_NOW === 'true') {
  runLeadGen().catch((err) => handleError(`Unhandled error: ${err.message}`));
}

// Daily cron at 7:00 AM Eastern Time
cron.schedule(
  '0 7 * * *',
  () => runLeadGen().catch((err) => handleError(`Unhandled error: ${err.message}`)),
  { timezone: 'America/New_York' }
);

log('Scheduler active — next run at 7:00 AM Eastern Time (America/New_York).');
log('To run immediately: set RUN_NOW=true or run `npm run run-now`.');
