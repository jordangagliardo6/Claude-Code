'use strict';
require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ─── Configuration ─────────────────────────────────────────────────────────────
// Edit these values to change targeting without touching the search logic.

const APOLLO_API_KEY  = process.env.APOLLO_API_KEY;
const SHEET_ID        = process.env.GOOGLE_SHEET_ID;
const ALERT_EMAIL     = process.env.ALERT_EMAIL;
const MAX_LEADS_PER_RUN = 25;

// Target cities for Southwest Michigan — add or remove cities freely.
// Matching is case-insensitive. Nearby townships are included for coverage.
const TARGET_CITIES = new Set([
  'st joseph', 'saint joseph', 'benton harbor', 'benton charter township',
  'kalamazoo', 'portage', 'comstock',
  'holland', 'zeeland', 'hudsonville', 'jenison',
  'grand haven', 'spring lake', 'ferrysburg',
  'muskegon', 'muskegon heights', 'norton shores', 'fruitport',
  'south haven', 'coloma', 'stevensville', 'bridgman',
  'saugatuck', 'douglas', 'otsego', 'plainwell', 'paw paw',
]);

// Apollo job title filters — priority order (Owner first).
// Edit this list to expand or narrow the decision-maker net.
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'co founder',
  'general manager',
];

// Apollo keyword search drives industry filtering.
// Edit to add/remove niches (e.g. add "electrical" or "roofing").
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Google Sheet tab name. Change if your tab isn't named "Leads".
const SHEET_TAB = 'Leads';

// Column headers — order must match the row values built in appendLeads().
const HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank for manual use
  'Notes',    // left blank for manual use
];

// ─── Apollo Search ─────────────────────────────────────────────────────────────

/**
 * Query Apollo.io for HVAC owner-operators in Michigan.
 * Returns raw Apollo people objects. We over-fetch (3×) to account for
 * duplicates and contacts outside the target cities.
 */
async function searchApolloLeads() {
  const url = 'https://api.apollo.io/v1/mixed_people/search';

  const payload = {
    api_key: APOLLO_API_KEY,
    q_keywords: INDUSTRY_KEYWORDS.join(' '),
    person_titles: TARGET_TITLES,
    // Broad Michigan location — SW Michigan city filter applied after
    organization_locations: ['Michigan, United States'],
    // 1–25 employees = owner-operated small businesses
    num_employees_ranges: ['1,25'],
    page: 1,
    per_page: Math.min(MAX_LEADS_PER_RUN * 3, 100),
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    timeout: 30000,
  });

  return response.data.people || [];
}

// ─── Data Extraction ───────────────────────────────────────────────────────────

/**
 * Normalize a single Apollo contact into a flat lead object.
 * Returns null if the contact has no usable phone number — those are skipped.
 *
 * Phone priority: mobile > direct > work > organization phone.
 * The Apollo free/basic tier may not reveal personal numbers; in that case
 * the business phone from the organization record is used as a fallback.
 */
function extractLeadData(person) {
  const org = person.organization || {};

  // Sort phone_numbers by type priority then pick the best one
  let phone = '';
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    const typePriority = { mobile: 0, direct: 1, work: 2 };
    const sorted = [...person.phone_numbers].sort(
      (a, b) => (typePriority[a.type] ?? 9) - (typePriority[b.type] ?? 9)
    );
    phone = sorted[0]?.sanitized_number || sorted[0]?.number || '';
  }

  // Fall back to organization-level phone if no personal number found
  if (!phone && org.primary_phone?.number) {
    phone = org.primary_phone.sanitized_number || org.primary_phone.number;
  }

  // Skip contacts with no phone at all
  if (!phone) return null;

  const city = (person.city || org.city || '').trim();
  const website = (org.website_url || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  return {
    dateAdded:    new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
    businessName: (org.name || '').trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name || '').trim(),
    phone,
    city,
    website,
  };
}

/**
 * Returns true if the city string matches a Southwest Michigan target city.
 */
function isInTargetArea(city) {
  return city ? TARGET_CITIES.has(city.toLowerCase().trim()) : false;
}

// ─── Google Sheets Auth ────────────────────────────────────────────────────────

/**
 * Build a Google Auth client for the Sheets API.
 *
 * Priority:
 *   1. credentials.json file in this directory (recommended — download from GCP console)
 *   2. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY environment variables
 *
 * The service account must be shared on the Google Sheet with Editor access.
 */
async function getAuthClient() {
  const credFile = path.join(__dirname, 'credentials.json');

  if (fs.existsSync(credFile)) {
    const creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth.getClient();
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key:  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth.getClient();
  }

  throw new Error(
    'Google credentials not found.\n' +
    '  Option A: Place credentials.json in the hvac-lead-gen/ folder.\n' +
    '  Option B: Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env.'
  );
}

// ─── Google Sheets Operations ──────────────────────────────────────────────────

/**
 * Read column B (Business Name) from row 2 onward.
 * Returns a Set of lowercased names for O(1) duplicate lookups.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!B2:B`,
  });

  const rows  = res.data.values || [];
  const names = new Set();
  for (const row of rows) {
    if (row[0]) names.add(row[0].toLowerCase().trim());
  }
  return names;
}

/**
 * Write the column headers in row 1 if the sheet is empty.
 * Safe to call on every run — it's a no-op if headers already exist.
 */
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1:I1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId:   SHEET_ID,
      range:           `${SHEET_TAB}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody:     { values: [HEADERS] },
    });
    console.log('  Created sheet headers.');
  }
}

/**
 * Append an array of lead objects to the bottom of the sheet.
 * Column order must match the HEADERS constant.
 */
async function appendLeads(sheets, leads) {
  const rows = leads.map(lead => [
    lead.dateAdded,
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
    range:            `${SHEET_TAB}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: rows },
  });
}

// ─── Error Alerts ──────────────────────────────────────────────────────────────

/**
 * Send an email notification when the job fails.
 * Silently skips if SMTP credentials are not configured.
 */
async function sendErrorAlert(error) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('  [Alert] SMTP not configured — logging to console only.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const recipient = ALERT_EMAIL || process.env.SMTP_USER;

  await transporter.sendMail({
    from:    process.env.SMTP_USER,
    to:      recipient,
    subject: '[HVAC Lead Gen] Job Failed – Action Required',
    text: [
      `The HVAC lead generation job failed at ${new Date().toISOString()}.`,
      '',
      `Error: ${error.message}`,
      '',
      'Please check the server logs and verify:',
      '  1. APOLLO_API_KEY is valid and has remaining credits',
      '  2. GOOGLE_SHEET_ID is correct',
      '  3. credentials.json is present (or env vars are set)',
      '  4. The Google Sheet is shared with the service account email',
    ].join('\n'),
  });

  console.log(`  [Alert] Email sent to ${recipient}`);
}

// ─── Main Job ──────────────────────────────────────────────────────────────────

async function runJob() {
  const startTime = new Date();
  console.log(`\n[${startTime.toISOString()}] ── HVAC Lead Gen Run Starting ──`);

  if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set in environment');
  if (!SHEET_ID)       throw new Error('GOOGLE_SHEET_ID is not set in environment');

  try {
    // ── Step 1: Fetch from Apollo ──────────────────────────────────────────────
    console.log('  Searching Apollo.io for HVAC contacts in Michigan…');
    const apolloPeople = await searchApolloLeads();
    console.log(`  Apollo returned ${apolloPeople.length} contact(s).`);

    if (apolloPeople.length === 0) {
      throw new Error('Apollo returned 0 results — check API key and credit balance.');
    }

    // ── Step 2: Extract & filter ───────────────────────────────────────────────
    const allLeads = apolloPeople
      .map(extractLeadData)
      .filter(Boolean)                         // drop contacts with no phone
      .filter(lead => lead.businessName !== ''); // drop contacts with no company name

    // Prefer SW Michigan cities; fall back to all Michigan if fewer than 5 match
    const swLeads       = allLeads.filter(l => isInTargetArea(l.city));
    const candidateLeads = swLeads.length >= 5 ? swLeads : allLeads;

    console.log(
      `  After filtering: ${candidateLeads.length} usable lead(s) ` +
      `(${swLeads.length} in target cities)`
    );

    // ── Step 3: Connect to Google Sheets ──────────────────────────────────────
    console.log('  Connecting to Google Sheets…');
    const auth   = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // ── Step 4: Ensure column headers exist ───────────────────────────────────
    await ensureHeaders(sheets);

    // ── Step 5: Deduplication ─────────────────────────────────────────────────
    const existingNames = await getExistingBusinessNames(sheets);
    console.log(`  Sheet has ${existingNames.size} existing business(es).`);

    const newLeads = candidateLeads.filter(
      lead => !existingNames.has(lead.businessName.toLowerCase().trim())
    );
    console.log(`  New (non-duplicate) leads: ${newLeads.length}`);

    // ── Step 6: Cap at max per run ─────────────────────────────────────────────
    const toAdd = newLeads.slice(0, MAX_LEADS_PER_RUN);

    if (toAdd.length === 0) {
      console.log('  No new leads to add — all duplicates or no phone numbers. Done.');
      return { added: 0 };
    }

    // ── Step 7: Append to sheet ────────────────────────────────────────────────
    console.log(`  Appending ${toAdd.length} lead(s) to Google Sheet…`);
    await appendLeads(sheets, toAdd);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toISOString()}] Done — added ${toAdd.length} lead(s) in ${elapsed}s.\n`);

    return { added: toAdd.length };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Job failed: ${error.message}`);
    if (error.response?.data) {
      console.error('  API response:', JSON.stringify(error.response.data, null, 2));
    }
    // Fire-and-forget alert; don't let a mail failure mask the original error
    await sendErrorAlert(error).catch(e =>
      console.error('  Failed to send alert email:', e.message)
    );
    throw error;
  }
}

module.exports = { runJob };

// Allow running directly: `node index.js` or `npm run run-now`
if (require.main === module) {
  runJob().catch(() => process.exit(1));
}
