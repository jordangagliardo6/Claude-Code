'use strict';

/**
 * HVAC Lead Generation — Apollo.io → Google Sheets
 *
 * Searches Apollo for HVAC owner/decision-maker contacts in Southwest Michigan,
 * deduplicates against the existing sheet, and appends up to MAX_LEADS_PER_RUN
 * new rows each run.
 *
 * To change cities, titles, or column layout, edit the CONFIG section below.
 * Run directly:  node lead-gen.js
 * Run scheduled: node scheduler.js  (7am ET daily via node-cron)
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const path = require('path');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Edit this section to change search parameters or column structure.

const CONFIG = {
  // Target cities — add or remove entries freely.
  // Apollo accepts "City, State" strings.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // SIC codes for HVAC / Plumbing / Mechanical (used to filter by industry)
  //   1711 — Plumbing, Heating, Air-Conditioning
  //   7623 — Refrigeration & Heating Equipment & Supplies
  //   1731 — Electrical Work (catches mechanical contractors)
  industrySicCodes: ['1711', '7623', '1731'],

  // Employee headcount: 1–25 (owner-operated small businesses)
  employeeRange: '1,25',

  // Job titles to target, in priority order.
  // Apollo searches all of these in a single request.
  ownerTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Max new leads to add per run (keeps the list manageable)
  maxLeadsPerRun: 25,

  // Spreadsheet tab name — must match exactly (case-sensitive)
  sheetTab: 'Sheet1',
};

// Column order written to the sheet — edit ONLY if you restructure the headers.
// The sheet must have these headers in row 1:
//   A: Date Added | B: Business Name | C: Owner First Name | D: Owner Last Name
//   E: Phone Number | F: City | G: Website | H: Called | I: Notes
const SHEET_RANGE = `${CONFIG.sheetTab}!A:I`;

// ─── APOLLO SEARCH ─────────────────────────────────────────────────────────────

async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  const leads = [];

  for (const city of CONFIG.cities) {
    if (leads.length >= CONFIG.maxLeadsPerRun) break;

    const remaining = CONFIG.maxLeadsPerRun - leads.length;

    try {
      const { data } = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        {
          api_key: apiKey,
          person_titles: CONFIG.ownerTitles,
          organization_locations: [city],
          organization_num_employees_ranges: [CONFIG.employeeRange],
          organization_sic_codes: CONFIG.industrySicCodes,
          per_page: Math.min(remaining, 25),
          page: 1,
          // Only return people who have at least one phone number
          contact_phone_required: true,
        },
        {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          timeout: 20000,
        }
      );

      for (const person of data.people || []) {
        if (leads.length >= CONFIG.maxLeadsPerRun) break;

        const phone = pickBestPhone(person.phone_numbers);
        if (!phone) continue; // skip contacts with no phone on record

        leads.push({
          dateAdded: todayUS(),
          businessName: (person.organization?.name || '').trim(),
          ownerFirst:   (person.first_name || '').trim(),
          ownerLast:    (person.last_name || '').trim(),
          phone,
          city:         resolveCity(person, city),
          website:      (person.organization?.website_url || '').trim(),
          called:       '',
          notes:        '',
        });
      }

      // Respect Apollo rate limits between city queries
      await sleep(1200);

    } catch (err) {
      const status = err.response?.status;
      const apiMsg  = err.response?.data?.error || err.message;

      // Plan-gated error — re-throw so the caller can surface it clearly
      if (status === 403 || (apiMsg && apiMsg.includes('not included in your Free plan'))) {
        throw new Error(
          'Apollo plan error: the people-search endpoint requires a paid Apollo plan.\n' +
          'Upgrade at https://www.apollo.io/pricing to enable automated lead pulls.\n' +
          `API response: ${apiMsg}`
        );
      }

      // Non-fatal per-city failure — log and continue to the next city
      console.warn(`  ⚠  Apollo search skipped for "${city}": ${apiMsg}`);
    }
  }

  return leads;
}

// Choose the best available phone number: mobile > direct > any
function pickBestPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;
  const find = type => phoneNumbers.find(p => p.type === type)?.sanitized_number;
  return find('mobile') || find('direct') || phoneNumbers[0]?.sanitized_number || null;
}

// Extract city from person record; fall back to the search city label
function resolveCity(person, searchCity) {
  return (
    person.city ||
    person.organization?.city ||
    searchCity.replace(', Michigan', '').replace(', MI', '')
  );
}

// ─── GOOGLE SHEETS ─────────────────────────────────────────────────────────────

async function buildSheetsClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

  if (keyFile) {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyFile),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
  }

  // OAuth2 fallback — requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
  // and GOOGLE_REFRESH_TOKEN in your .env file.
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_PATH (preferred) ' +
      'or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN in .env'
    );
  }

  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return google.sheets({ version: 'v4', auth: oauth2 });
}

// Returns a Set of lowercased business names already in the sheet (for dedup)
async function loadExistingNames(sheets) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CONFIG.sheetTab}!B:B`, // Column B = Business Name
  });

  return new Set(
    (res.data.values || [])
      .slice(1) // skip header row
      .map(row => (row[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

// Appends rows to the sheet and returns the count added
async function appendLeads(sheets, leads) {
  if (leads.length === 0) return 0;

  const rows = leads.map(l => [
    l.dateAdded,
    l.businessName,
    l.ownerFirst,
    l.ownerLast,
    l.phone,
    l.city,
    l.website,
    l.called,
    l.notes,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─── ERROR NOTIFICATIONS ───────────────────────────────────────────────────────

async function notify(subject, body) {
  const { SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL } = process.env;

  if (!SMTP_USER || !SMTP_PASS) {
    // SMTP not configured — log clearly so it's easy to spot in any log viewer
    console.error('\n╔══════════════════════════════════════════════════════════╗');
    console.error(`║  ALERT: ${subject}`);
    console.error('╠══════════════════════════════════════════════════════════╣');
    console.error(`║  ${body.split('\n').join('\n║  ')}`);
    console.error('╚══════════════════════════════════════════════════════════╝\n');
    return;
  }

  const to   = NOTIFICATION_EMAIL || SMTP_USER;
  const from = SMTP_USER;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from,
    to,
    subject: `[HVAC Lead Gen] ${subject}`,
    text:    `${body}\n\nTimestamp: ${new Date().toISOString()}`,
  });

  console.log(`  ✉  Error notification sent to ${to}`);
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function todayUS() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'America/Detroit' });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── MAIN RUN ──────────────────────────────────────────────────────────────────

async function run() {
  const timestamp = new Date().toISOString();
  console.log(`\n──────────────────────────────────────────`);
  console.log(`  HVAC Lead Gen  •  ${timestamp}`);
  console.log(`──────────────────────────────────────────`);

  // 1. Connect to Google Sheets
  let sheets;
  try {
    sheets = await buildSheetsClient();
    console.log('  ✓ Google Sheets connected');
  } catch (err) {
    console.error(`  ✗ Google Sheets connection failed: ${err.message}`);
    await notify(
      'Google Sheets connection failed',
      `The lead-gen run could not connect to Google Sheets.\n\nError: ${err.message}\n\nCheck that GOOGLE_SERVICE_ACCOUNT_PATH (or OAuth credentials) are correct in .env`
    );
    return { success: false, reason: err.message };
  }

  // 2. Load existing names for dedup
  let existingNames;
  try {
    existingNames = await loadExistingNames(sheets);
    console.log(`  ✓ Loaded ${existingNames.size} existing businesses for dedup`);
  } catch (err) {
    console.error(`  ✗ Could not read sheet: ${err.message}`);
    await notify('Sheet read failed', `Error reading existing leads from sheet.\n\nError: ${err.message}`);
    return { success: false, reason: err.message };
  }

  // 3. Search Apollo
  let candidates;
  try {
    console.log(`  ⟳  Searching Apollo across ${CONFIG.cities.length} cities...`);
    candidates = await searchApolloLeads();
    console.log(`  ✓ Apollo returned ${candidates.length} candidate(s)`);
  } catch (err) {
    console.error(`  ✗ Apollo search failed: ${err.message}`);
    await notify('Apollo search error', err.message);
    return { success: false, reason: err.message };
  }

  if (candidates.length === 0) {
    const msg = 'Apollo returned zero results for all target cities. Check your API key and plan level.';
    console.warn(`  ⚠  ${msg}`);
    await notify('No results returned', msg);
    return { success: true, added: 0 };
  }

  // 4. Deduplicate
  const newLeads = candidates.filter(
    l => l.businessName && !existingNames.has(l.businessName.toLowerCase())
  );
  const dupeCount = candidates.length - newLeads.length;
  console.log(`  ✓ ${newLeads.length} new lead(s) after removing ${dupeCount} duplicate(s)`);

  if (newLeads.length === 0) {
    console.log('  ℹ  All candidates already in sheet. Nothing to add.');
    return { success: true, added: 0 };
  }

  // 5. Write to sheet
  try {
    const added = await appendLeads(sheets, newLeads);
    console.log(`  ✓ Appended ${added} new lead(s) to sheet`);
    console.log(`    https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`);
    return { success: true, added };
  } catch (err) {
    console.error(`  ✗ Sheet write failed: ${err.message}`);
    await notify(
      'Sheet write failed',
      `Leads were found but could not be written to the spreadsheet.\n\nError: ${err.message}\n\nLeads lost (${newLeads.length}):\n${newLeads.map(l => `${l.businessName} — ${l.phone}`).join('\n')}`
    );
    return { success: false, reason: err.message };
  }
}

module.exports = { run };

// Support: node lead-gen.js
if (require.main === module) {
  run().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
