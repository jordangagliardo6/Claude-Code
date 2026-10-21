/**
 * HVAC Lead Generator
 * Pulls HVAC company leads from Apollo.io for Southwest Michigan
 * and appends them to a Google Sheets spreadsheet.
 *
 * Run manually:  node index.js
 * Scheduled run: node cron-job.js  (7am Eastern daily)
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');

// ─── Configuration ────────────────────────────────────────────────────────────

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// Southwest Michigan cities to search — add or remove cities here freely
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Apollo.io industries to target
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// Job titles in priority order (Owner first, then down the chain)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Google Sheets tab name — change if your sheet tab has a different name
const SHEET_NAME = 'Sheet1';

// Column headers (must match your spreadsheet exactly)
const COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

// ─── Apollo.io API ────────────────────────────────────────────────────────────

/**
 * Search Apollo.io for HVAC contacts across target cities.
 * Returns up to MAX_LEADS contacts that have a phone number.
 */
async function searchApolloLeads() {
  console.log('[Apollo] Starting search across', TARGET_CITIES.length, 'cities...');

  const allContacts = [];

  for (const city of TARGET_CITIES) {
    if (allContacts.length >= MAX_LEADS) break;

    try {
      const contacts = await fetchContactsForCity(city);
      allContacts.push(...contacts);
      console.log(`[Apollo] ${city}: found ${contacts.length} contacts (total so far: ${allContacts.length})`);
    } catch (err) {
      console.error(`[Apollo] Error fetching contacts for ${city}:`, err.message);
    }
  }

  // Deduplicate within this batch by organization name (case-insensitive)
  const seen = new Set();
  const unique = allContacts.filter((c) => {
    const key = (c.organization?.name || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, MAX_LEADS);
}

/**
 * Fetch contacts for a single city from Apollo.io.
 * Uses the /people/search endpoint with org + person filters.
 */
async function fetchContactsForCity(city) {
  const payload = {
    api_key: APOLLO_API_KEY,
    q_organization_keyword_tags: TARGET_INDUSTRIES,
    // Require at least one of our target job titles
    person_titles: TARGET_TITLES,
    // Company headcount: 1–25 employees
    organization_num_employees_ranges: ['1,25'],
    // Location: Michigan, biased toward the specific city
    person_locations: [`${city}, Michigan, United States`],
    // Only return contacts that have a phone number
    contact_phone_status: 'verified',
    // Page size — fetch a reasonable batch per city
    per_page: 10,
    page: 1,
  };

  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000,
    }
  );

  const people = response.data?.people || [];

  // Filter: must have at least one phone number
  return people.filter((p) => {
    const phone = extractBestPhone(p);
    return !!phone;
  });
}

/**
 * Extract the best available phone number from an Apollo contact.
 * Prefers direct_dial, then mobile_phone, then any organization phone.
 */
function extractBestPhone(contact) {
  if (contact.direct_dial_phone) return contact.direct_dial_phone;
  if (contact.mobile_phone) return contact.mobile_phone;
  if (contact.phone_number) return contact.phone_number;
  if (contact.organization?.phone) return contact.organization.phone;
  return null;
}

/**
 * Normalize a raw Apollo contact into our spreadsheet row format.
 */
function normalizeContact(contact) {
  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

  return {
    dateAdded: today,
    businessName: contact.organization?.name || '',
    firstName: contact.first_name || '',
    lastName: contact.last_name || '',
    phone: formatPhone(extractBestPhone(contact) || ''),
    city: contact.city || contact.organization?.city || '',
    website: contact.organization?.website_url || '',
  };
}

/**
 * Format a phone number to (XXX) XXX-XXXX style when possible.
 */
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw; // Return as-is if format is unexpected
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

/**
 * Build an authenticated Google Sheets client using OAuth credentials
 * stored in environment variables.
 */
function buildSheetsClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all existing Business Name values from the sheet so we can
 * skip duplicates before appending.
 */
async function getExistingBusinessNames(sheets) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      // Column B (index 1) holds Business Name — adjust if your layout differs
      range: `${SHEET_NAME}!B:B`,
    });

    const rows = res.data.values || [];
    // Skip the header row; collect all business names as lowercase for comparison
    return new Set(
      rows
        .slice(1)
        .map((r) => (r[0] || '').toLowerCase().trim())
        .filter(Boolean)
    );
  } catch (err) {
    // If the sheet is empty or the range doesn't exist, treat as no existing entries
    console.warn('[Sheets] Could not read existing entries (may be empty sheet):', err.message);
    return new Set();
  }
}

/**
 * Ensure the header row exists; create it if the sheet is empty.
 */
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!1:1`,
  });

  const firstRow = res.data.values?.[0] || [];
  if (firstRow.length === 0) {
    console.log('[Sheets] Sheet is empty — writing header row...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
  }
}

/**
 * Append new lead rows to the Google Sheet.
 * Returns the number of rows actually appended.
 */
async function appendLeads(sheets, leads) {
  if (leads.length === 0) {
    console.log('[Sheets] No new leads to append.');
    return 0;
  }

  const rows = leads.map((l) => [
    l.dateAdded,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website,
    '', // Called — left blank for manual tracking
    '', // Notes — left blank for manual tracking
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new leads.`);
  return rows.length;
}

// ─── Main Workflow ────────────────────────────────────────────────────────────

async function run() {
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log(`[Run] HVAC Lead Generator — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('='.repeat(60));

  // Validate required env vars before doing any work
  const missing = [];
  if (!APOLLO_API_KEY) missing.push('APOLLO_API_KEY');
  if (!SPREADSHEET_ID) missing.push('GOOGLE_SPREADSHEET_ID');
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!process.env.GOOGLE_REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');

  if (missing.length > 0) {
    const msg = `[Error] Missing required environment variables: ${missing.join(', ')}`;
    console.error(msg);
    await logError(msg);
    return { success: false, error: msg };
  }

  let apolloContacts = [];
  let appended = 0;

  try {
    // Step 1: Pull leads from Apollo.io
    apolloContacts = await searchApolloLeads();
    console.log(`[Apollo] Search complete — ${apolloContacts.length} raw contacts returned`);

    if (apolloContacts.length === 0) {
      const msg = '[Apollo] No results returned. The query may need adjustment or the API key may be invalid.';
      console.warn(msg);
      await logError(msg);
      return { success: false, error: msg };
    }
  } catch (err) {
    const msg = `[Apollo] API request failed: ${err.message}`;
    console.error(msg);
    await logError(msg);
    return { success: false, error: msg };
  }

  try {
    // Step 2: Connect to Google Sheets
    const sheets = buildSheetsClient();
    await ensureHeaders(sheets);

    // Step 3: Load existing business names to skip duplicates
    const existing = await getExistingBusinessNames(sheets);
    console.log(`[Sheets] ${existing.size} existing businesses already in the sheet`);

    // Step 4: Normalize and filter out duplicates
    const newLeads = apolloContacts
      .map(normalizeContact)
      .filter((lead) => {
        if (!lead.businessName) return false; // Skip contacts with no company
        if (existing.has(lead.businessName.toLowerCase().trim())) {
          console.log(`[Dedup] Skipping duplicate: ${lead.businessName}`);
          return false;
        }
        return true;
      });

    console.log(`[Dedup] ${newLeads.length} new leads after duplicate check`);

    // Step 5: Append to sheet
    appended = await appendLeads(sheets, newLeads);
  } catch (err) {
    const msg = `[Sheets] Google Drive write failed: ${err.message}`;
    console.error(msg);
    await logError(msg);
    return { success: false, error: msg };
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[Run] Done in ${elapsed}s — ${appended} new leads added to spreadsheet.`);
  console.log('='.repeat(60));

  return { success: true, appended };
}

/**
 * Log errors to a local file and print a clear console notice.
 * Extend this to send email/SMS if needed.
 */
async function logError(message) {
  const fs = require('fs');
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;

  try {
    fs.appendFileSync('error.log', line);
  } catch (e) {
    // If we can't write the log, at least the console message is visible
  }

  console.error('\n⚠️  ERROR — check error.log for details');
  console.error(`   Notification email: ${process.env.NOTIFICATION_EMAIL || '(NOTIFICATION_EMAIL not set)'}`);
}

// Run when executed directly (not imported as a module)
if (require.main === module) {
  run().then((result) => {
    if (!result.success) process.exit(1);
  });
}

module.exports = { run };
