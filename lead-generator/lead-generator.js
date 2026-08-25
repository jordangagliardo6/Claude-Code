/**
 * HVAC Lead Generator — Apollo.io → Google Sheets
 *
 * Searches Apollo.io for HVAC/plumbing/mechanical small-business owners in
 * Southwest Michigan, deduplicates against the existing spreadsheet, and
 * appends up to 25 new leads per run.
 *
 * Schedule: 7:00 AM Eastern Time, Monday–Friday (node-cron)
 *
 * Required env vars (copy .env.example → .env and fill in):
 *   APOLLO_API_KEY              — your Apollo.io API key
 *   GOOGLE_SERVICE_ACCOUNT_FILE — path to your service-account JSON (default: google-credentials.json)
 *   SPREADSHEET_ID              — Google Sheet ID from the URL
 *   NOTIFY_EMAIL                — where to send error alerts
 *   RUN_NOW                     — set "true" to run immediately instead of waiting for cron
 */

require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');

// ─── Configuration ─────────────────────────────────────────────────────────────
// Edit these values to change cities, titles, or sheet structure later.

const CONFIG = {
  // Southwest Michigan target cities — add or remove entries freely
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Apollo keyword tags to narrow to HVAC/plumbing/mechanical companies
  industryKeywords: [
    'HVAC',
    'Heating',
    'Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Target job titles in priority order (Owner first)
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Company headcount bracket — 1-25 = owner-operated small business
  employeeRange: '1,25',

  // Cap new leads per scheduled run so the list stays manageable
  maxLeadsPerRun: 25,

  // Google Sheets spreadsheet ID (the long string in the URL between /d/ and /edit)
  spreadsheetId: process.env.SPREADSHEET_ID || '1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo',

  // Tab name inside the spreadsheet
  sheetName: 'Sheet1',

  // Email to notify on errors
  notifyEmail: process.env.NOTIFY_EMAIL || 'jgagliardo98@gmail.com',
};

// ─── Apollo API ────────────────────────────────────────────────────────────────

/**
 * Searches each target city in Apollo and returns a flat array of raw person objects.
 * Requires a paid Apollo plan for the mixed_people/search endpoint.
 */
async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set — add it to your .env file');

  const allPeople = [];

  for (const city of CONFIG.cities) {
    try {
      const response = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        {
          api_key: apiKey,
          q_keywords: CONFIG.industryKeywords.join(' '),
          // person_titles with include_similar_titles=false gives strict matches
          person_titles: CONFIG.jobTitles,
          include_similar_titles: false,
          person_locations: [city],
          organization_num_employees_ranges: [CONFIG.employeeRange],
          per_page: 25,
          page: 1,
        },
        {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout: 30_000,
        }
      );

      const people = response.data?.people ?? [];
      console.log(`  [Apollo] ${city}: ${people.length} results`);
      allPeople.push(...people);
    } catch (err) {
      const detail = err.response?.data?.error || err.message;
      logError(`Apollo search failed for "${city}": ${detail}`);
      // Continue to next city rather than aborting the whole run
    }
  }

  return allPeople;
}

// ─── Data Extraction ───────────────────────────────────────────────────────────

/**
 * Maps a raw Apollo person object to our lead shape.
 * Returns null when the contact has no phone — those are excluded per spec.
 */
function extractLeadData(person) {
  // Prefer mobile → direct → hq in that order
  const phoneNumbers = person.phone_numbers ?? [];
  const phone =
    person.sanitized_phone ||
    phoneNumbers.find(p => p.type === 'mobile')?.sanitized_number ||
    phoneNumbers.find(p => p.type === 'work_direct')?.sanitized_number ||
    phoneNumbers.find(p => p.type === 'work_hq')?.sanitized_number ||
    null;

  if (!phone) return null;

  const org = person.organization ?? person.account ?? {};
  const websiteUrl =
    org.website_url ||
    (org.primary_domain ? `https://${org.primary_domain}` : '');

  return {
    businessName: org.name || '',
    firstName:    person.first_name || '',
    lastName:     person.last_name || '',
    phone,
    city:         person.city || org.city || '',
    website:      websiteUrl,
  };
}

// ─── Google Sheets ─────────────────────────────────────────────────────────────

/** Creates an authenticated Google Sheets API client via service account. */
async function getSheetClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || 'google-credentials.json';
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Reads column B (Business Name) from the sheet and returns a lowercase Set.
 * Used for O(1) duplicate checks.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!B2:B`, // Skip header row
  });
  const rows = res.data.values ?? [];
  return new Set(rows.flat().map(n => n.toLowerCase().trim()));
}

/** Appends lead rows to the sheet and returns the count written. */
async function appendLeadsToSheet(sheets, leads) {
  if (!leads.length) return 0;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Column order must match the spreadsheet header:
  // Date Added | Business Name | Owner First Name | Owner Last Name |
  // Phone Number | City | Website | Called | Notes
  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — intentionally blank
    '', // Notes  — intentionally blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─── Connection Verification ────────────────────────────────────────────────────

/**
 * Lightweight connectivity check — call before the first scheduled run to
 * confirm both Apollo and Google Sheets are reachable.
 */
async function verifyConnections() {
  console.log('\n── Verifying connections ──────────────────────────────────');

  // Apollo
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) throw new Error('APOLLO_API_KEY is missing');
    const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      params: { api_key: apiKey },
      timeout: 10_000,
    });
    if (res.data?.is_logged_in) {
      console.log('✓ Apollo.io   — authenticated OK');
    } else {
      console.warn('⚠ Apollo.io   — responded but not logged in. Check your API key.');
    }
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    console.error(`✗ Apollo.io   — FAILED: ${detail}`);
  }

  // Google Sheets
  try {
    const sheets = await getSheetClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: CONFIG.spreadsheetId,
      fields: 'properties.title',
    });
    console.log(`✓ Google Sheets — connected to "${meta.data.properties.title}"`);
  } catch (err) {
    console.error(`✗ Google Sheets — FAILED: ${err.message}`);
  }

  console.log('───────────────────────────────────────────────────────────\n');
}

// ─── Main Workflow ─────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const startTs = new Date().toISOString();
  console.log(`\n[${startTs}] ── Lead generation run starting ──────────────`);

  try {
    // 1. Connect to Google Sheets
    let sheets;
    try {
      sheets = await getSheetClient();
      console.log('✓ Google Sheets connected');
    } catch (err) {
      throw new Error(`Google Sheets connection failed: ${err.message}`);
    }

    // 2. Read existing entries for deduplication
    const existing = await getExistingBusinessNames(sheets);
    console.log(`  ${existing.size} existing businesses in sheet`);

    // 3. Search Apollo
    console.log('  Querying Apollo.io...');
    const rawPeople = await searchApolloLeads();
    console.log(`  ${rawPeople.length} total raw results from Apollo`);

    if (!rawPeople.length) {
      logError(
        'Apollo returned 0 results. Possible causes:\n' +
        '  • API key is invalid or plan does not include People Search\n' +
        '  • Rate limit hit — try again later\n' +
        `  • No matches for the current city/title filters`
      );
      return;
    }

    // 4. Extract fields, require phone, deduplicate
    const newLeads = rawPeople
      .map(extractLeadData)
      .filter(Boolean)                                                // must have phone
      .filter(l => l.businessName)                                   // must have company
      .filter(l => !existing.has(l.businessName.toLowerCase().trim())); // skip duplicates

    console.log(`  ${newLeads.length} new leads after filtering and dedup`);

    // 5. Cap per-run and write
    const toWrite = newLeads.slice(0, CONFIG.maxLeadsPerRun);
    const written = await appendLeadsToSheet(sheets, toWrite);

    if (written > 0) {
      console.log(`✓ Added ${written} new lead(s):`);
      toWrite.forEach(l =>
        console.log(`    • ${l.businessName} | ${l.city} | ${l.phone}`)
      );
    } else {
      console.log('  No new leads to add this run — list is up to date');
    }
  } catch (err) {
    logError(`Run failed: ${err.message}\n${err.stack}`);
    throw err;
  }

  console.log(`[${new Date().toISOString()}] ── Run complete ─────────────────────────────────\n`);
}

// ─── Error Logging / Email Alerts ─────────────────────────────────────────────

function logError(message) {
  console.error(`\n[ERROR ${new Date().toISOString()}]\n${message}\n`);

  // Uncomment the block below and install nodemailer to enable email alerts.
  // npm install nodemailer
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // transporter.sendMail({
  //   from: process.env.SMTP_USER,
  //   to: CONFIG.notifyEmail,
  //   subject: `[Lead Generator] Error — ${new Date().toDateString()}`,
  //   text: message,
  // }).catch(e => console.error('Email alert failed:', e.message));
}

// ─── Entry Point ───────────────────────────────────────────────────────────────

(async () => {
  if (process.env.VERIFY === 'true') {
    // npm run verify — check connections without running a lead pull
    await verifyConnections();
    return;
  }

  if (process.env.RUN_NOW === 'true') {
    // npm run test-run — run once immediately, then exit
    await runLeadGeneration().catch(err => {
      logError(err.message);
      process.exit(1);
    });
    return;
  }

  // Default: start cron scheduler
  // "0 7 * * 1-5" = 7:00 AM, Monday–Friday
  cron.schedule('0 7 * * 1-5', runLeadGeneration, {
    timezone: 'America/New_York', // handles EST ↔ EDT automatically
  });

  console.log('Lead generator started.');
  console.log('Scheduled: 7:00 AM ET, Monday–Friday');
  console.log('Tip: run `npm run verify` to test connections before the first scheduled run.');
  console.log('Tip: run `npm run test-run` to trigger an immediate run now.\n');
})();
