/**
 * HVAC Lead Generation — Apollo.io → Google Sheets
 *
 * Searches Apollo.io for HVAC owner-operators in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends new leads.
 *
 * Run once:  node index.js
 * Scheduled: node scheduler.js  (7 AM Eastern daily via node-cron)
 */

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

// ─── Configuration ────────────────────────────────────────────────────────────
// Edit these values to change search targets or column layout.

const CONFIG = {
  // Cities to target — change or add cities here
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Industries passed to Apollo keyword filter
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Job titles in priority order (Apollo searches all of them, we sort client-side)
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Priority map for sorting (lower = higher priority)
  titlePriority: {
    owner: 0,
    president: 1,
    founder: 2,
    'co-founder': 3,
    'general manager': 4,
  },

  // Company size — Apollo expects "min,max" strings
  employeeRange: '1,25',

  // Max leads to add per run
  maxLeadsPerRun: 25,

  // Spreadsheet settings — override via .env
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  sheetName: process.env.SHEET_NAME || 'Sheet1',

  // Notification target
  notificationEmail: process.env.NOTIFICATION_EMAIL || '',
};

// Column layout — change indices here if you rearrange the sheet
const COLUMNS = {
  DATE_ADDED: 0,       // A
  BUSINESS_NAME: 1,    // B  ← used for duplicate check
  FIRST_NAME: 2,       // C
  LAST_NAME: 3,        // D
  PHONE: 4,            // E
  CITY: 5,             // F
  WEBSITE: 6,          // G
  CALLED: 7,           // H  (blank)
  NOTES: 8,            // I  (blank)
};

// ─── Apollo.io ────────────────────────────────────────────────────────────────

async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in .env');

  const payload = {
    // Titles to match (Apollo matches any of these)
    person_titles: CONFIG.jobTitles,

    // Locations — Apollo accepts "City, State" strings
    organization_locations: CONFIG.cities,

    // Employee count range
    organization_num_employees_ranges: [CONFIG.employeeRange],

    // Industry keyword filter — at least one must match
    organization_keyword_tags: CONFIG.industryKeywords,

    // Only return contacts that have a phone number
    contact_phone_numbers_available: true,

    page: 1,
    per_page: 50, // Fetch extra so dedup doesn't starve us
  };

  const response = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      timeout: 30_000,
    }
  );

  return response.data.people || [];
}

/**
 * Normalize a raw Apollo person record into a flat lead object.
 * Returns null if the record has no usable phone number.
 */
function normalizeApolloRecord(person) {
  // Prefer mobile > direct > any available number
  const phoneNumbers = person.phone_numbers || [];
  const mobile = phoneNumbers.find(p => p.type === 'mobile');
  const direct = phoneNumbers.find(p => p.type === 'direct');
  const anyPhone = phoneNumbers[0];
  const phone = (mobile || direct || anyPhone)?.sanitized_number;

  if (!phone) return null;

  return {
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    businessName: person.organization_name || person.account?.name || '',
    phone,
    city: person.city || person.organization?.city || '',
    website: person.organization?.website_url || '',
    titleRaw: (person.title || '').toLowerCase(),
  };
}

/**
 * Sort leads by job title priority (Owner first, GM last).
 */
function sortByTitlePriority(leads) {
  return [...leads].sort((a, b) => {
    const pa = CONFIG.titlePriority[a.titleRaw] ?? 99;
    const pb = CONFIG.titlePriority[b.titleRaw] ?? 99;
    return pa - pb;
  });
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

function buildGoogleAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'credentials.json';
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Return a Set of lowercased business names already in the sheet.
 * We read column B (Business Name) starting at row 2 to skip the header.
 */
async function getExistingBusinessNames(sheets) {
  const sheetId = CONFIG.spreadsheetId;
  if (!sheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set in .env');

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CONFIG.sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(
    rows
      .map(row => row[0]?.toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Append an array of lead rows to the sheet.
 * Returns the number of rows appended.
 */
async function appendLeadsToSheet(sheets, leads) {
  if (leads.length === 0) return 0;

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const rows = leads.map(lead => {
    const row = new Array(Object.keys(COLUMNS).length).fill('');
    row[COLUMNS.DATE_ADDED]    = today;
    row[COLUMNS.BUSINESS_NAME] = lead.businessName;
    row[COLUMNS.FIRST_NAME]    = lead.firstName;
    row[COLUMNS.LAST_NAME]     = lead.lastName;
    row[COLUMNS.PHONE]         = lead.phone;
    row[COLUMNS.CITY]          = lead.city;
    row[COLUMNS.WEBSITE]       = lead.website;
    // CALLED and NOTES remain blank
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

// ─── Error Notifications ──────────────────────────────────────────────────────

async function sendErrorEmail(subject, body) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to   = CONFIG.notificationEmail;

  if (!user || !pass || !to) {
    // Email not configured — error is already in console
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: user,
      to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });

    console.log(`[notify] Error email sent to ${to}`);
  } catch (emailErr) {
    console.error('[notify] Failed to send error email:', emailErr.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runLeadGen() {
  console.log(`\n[${new Date().toISOString()}] Starting HVAC lead gen run`);

  let apolloRecords = [];
  let appendedCount = 0;

  // ── 1. Search Apollo ──────────────────────────────────────────────────────
  try {
    console.log('[apollo] Searching for HVAC leads in Southwest Michigan…');
    apolloRecords = await searchApolloLeads();
    console.log(`[apollo] Returned ${apolloRecords.length} raw records`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.response?.data?.message || err.message}`;
    console.error('[apollo] ERROR:', msg);
    await sendErrorEmail('Apollo search failed', msg);
    return { success: false, error: msg };
  }

  if (apolloRecords.length === 0) {
    const msg = 'Apollo returned 0 results. Try broadening your search filters.';
    console.warn('[apollo]', msg);
    await sendErrorEmail('No Apollo results', msg);
    return { success: false, error: msg };
  }

  // ── 2. Normalize and filter Apollo records ────────────────────────────────
  const normalized = apolloRecords
    .map(normalizeApolloRecord)
    .filter(Boolean); // drop any that have no phone

  console.log(`[apollo] ${normalized.length} records have phone numbers`);

  const sorted = sortByTitlePriority(normalized);

  // ── 3. Connect to Google Sheets ───────────────────────────────────────────
  let sheets;
  let existingNames;

  try {
    const auth = buildGoogleAuth();
    sheets = google.sheets({ version: 'v4', auth });
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`[sheets] Sheet has ${existingNames.size} existing businesses`);
  } catch (err) {
    const msg = `Google Sheets connection failed: ${err.message}`;
    console.error('[sheets] ERROR:', msg);
    await sendErrorEmail('Google Sheets connection failed', msg);
    return { success: false, error: msg };
  }

  // ── 4. Deduplicate ────────────────────────────────────────────────────────
  const newLeads = sorted
    .filter(lead => {
      const key = lead.businessName.toLowerCase().trim();
      return key && !existingNames.has(key);
    })
    .slice(0, CONFIG.maxLeadsPerRun);

  console.log(`[dedup] ${newLeads.length} new leads after deduplication (max ${CONFIG.maxLeadsPerRun})`);

  if (newLeads.length === 0) {
    console.log('[dedup] No new leads to add — all results already in sheet.');
    return { success: true, added: 0 };
  }

  // ── 5. Append to sheet ────────────────────────────────────────────────────
  try {
    appendedCount = await appendLeadsToSheet(sheets, newLeads);
    console.log(`[sheets] ✓ Appended ${appendedCount} new leads`);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    console.error('[sheets] ERROR:', msg);
    await sendErrorEmail('Google Sheets write failed', msg);
    return { success: false, error: msg };
  }

  console.log(`[done] Run complete — ${appendedCount} leads added\n`);
  return { success: true, added: appendedCount };
}

// Run immediately when executed directly (node index.js)
if (require.main === module) {
  runLeadGen().catch(err => {
    console.error('[fatal]', err.message);
    process.exit(1);
  });
}

module.exports = { runLeadGen };
