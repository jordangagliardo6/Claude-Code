/**
 * HVAC Lead Generator — Southwest Michigan
 * =========================================
 * Searches Apollo.io for HVAC business owners in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends up to 25
 * new leads per run. Scheduled for 7:00 AM Eastern every morning.
 *
 * Usage:
 *   node index.js            → starts the scheduler (runs daily at 7 AM ET)
 *   node index.js --verify   → runs immediately once so you can confirm
 *                              Apollo and Google Sheets are connected
 */

require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Everything you'd want to customize lives here.

const CONFIG = {
  // Cities/areas to target. These are matched against where the person is based.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Apollo keyword tags for HVAC / related industries
  industryKeywords: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // SIC codes: 1711 = Plumbing, Heating & Air Conditioning
  // Added as a secondary signal alongside keyword tags
  sicCodes: ['1711'],

  // Job titles — Apollo will search all of these; priority order is for your reference
  // Priority: Owner > President > Founder > Co-Founder > General Manager
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Only show owner-operated small businesses (1–25 employees)
  employeeRanges: ['1,10', '11,25'],

  // Cap per daily run — keeps your call list manageable
  maxLeadsPerRun: 25,

  // Google Sheets spreadsheet ID (from the URL between /d/ and /edit)
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',

  // Name of the tab inside the spreadsheet
  sheetName: 'Sheet1',

  // Your email — used for error alert notifications
  notificationEmail: 'jgagliardo98@gmail.com',
};

// ─── APOLLO API ──────────────────────────────────────────────────────────────

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 * Docs: https://apolloio.github.io/apollo-api-docs/#people-api
 */
async function searchApolloLeads(page = 1) {
  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    page,
    per_page: 50, // fetch more than the 25 cap so we can filter out no-phone records
    person_titles: CONFIG.jobTitles,
    person_locations: CONFIG.cities,
    organization_locations: ['Michigan, United States'],
    q_organization_keyword_tags: CONFIG.industryKeywords,
    organization_sic_codes: CONFIG.sicCodes,
    organization_num_employees_ranges: CONFIG.employeeRanges,
  };

  const res = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    timeout: 30_000,
  });

  return res.data;
}

/**
 * Extract the best available phone number from a person record.
 * Apollo returns phone_numbers as [{raw_number, type, …}, …].
 * Prefers direct/mobile over work lines.
 */
function extractPhone(person) {
  const numbers = person.phone_numbers || [];
  if (numbers.length === 0) return null;

  const mobileTypes = new Set(['direct_phone', 'mobile_phone', 'mobile', 'cell']);
  const preferred = numbers.find(p => mobileTypes.has(p.type));
  return (preferred || numbers[0]).raw_number || null;
}

/**
 * Map an Apollo person record to a flat lead object matching our sheet columns.
 */
function mapToLead(person) {
  const org = person.organization || {};
  const rawCity = person.city || org.city || '';

  return {
    dateAdded: new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: extractPhone(person) || '',
    city: rawCity.replace(/,?\s*(MI|Michigan)$/i, '').trim(),
    website: (org.website_url || org.primary_domain || '').trim(),
  };
}

// ─── GOOGLE SHEETS ────────────────────────────────────────────────────────────

/**
 * Build an authenticated Google Sheets client.
 *
 * Supports two credential modes:
 *   • GOOGLE_SERVICE_ACCOUNT_JSON — raw JSON string (handy for cloud environments)
 *   • GOOGLE_APPLICATION_CREDENTIALS — path to a service account JSON file
 *
 * Either way, share your spreadsheet with the service account email so it has
 * edit access (service account email looks like: name@project.iam.gserviceaccount.com).
 */
async function getSheetsClient() {
  let authConfig;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    authConfig = {
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    };
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    authConfig = {
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    };
  } else {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.'
    );
  }

  const auth = new google.auth.GoogleAuth(authConfig);
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Write the header row if column A1 is empty.
 */
async function ensureHeader(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A1:I1`,
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${CONFIG.sheetName}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
          'Phone Number', 'City', 'Website', 'Called', 'Notes',
        ]],
      },
    });
    console.log('  ✓ Header row written');
  }
}

/**
 * Read column B (Business Name) from the sheet and return a lowercase Set
 * for O(1) duplicate lookups.
 */
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.map(r => (r[0] || '').trim().toLowerCase()));
}

/**
 * Append an array of lead objects as new rows at the bottom of the sheet.
 * Columns: Date Added | Business Name | First Name | Last Name | Phone | City | Website | Called | Notes
 */
async function appendLeads(sheets, leads) {
  if (leads.length === 0) return;

  const values = leads.map(l => [
    l.dateAdded,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website,
    '', // Called — left blank for you to fill in
    '', // Notes  — left blank for you to fill in
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

// ─── MAIN WORKFLOW ────────────────────────────────────────────────────────────

async function runWorkflow() {
  const runStart = new Date().toISOString();
  console.log(`\n[${runStart}] ─── Lead generation run started ───`);

  if (!CONFIG.spreadsheetId) {
    logError('GOOGLE_SPREADSHEET_ID is not set. Add it to your .env file.');
    return;
  }
  if (!process.env.APOLLO_API_KEY) {
    logError('APOLLO_API_KEY is not set. Add it to your .env file.');
    return;
  }

  // 1. Connect to Google Sheets
  let sheets;
  try {
    sheets = await getSheetsClient();
    await ensureHeader(sheets);
    console.log('✓ Connected to Google Sheets');
  } catch (err) {
    logError(`Could not connect to Google Sheets — ${err.message}`);
    return;
  }

  // 2. Load existing business names for deduplication
  let existing;
  try {
    existing = await getExistingBusinessNames(sheets);
    console.log(`✓ Loaded ${existing.size} existing entries for duplicate check`);
  } catch (err) {
    logError(`Could not read existing leads from sheet — ${err.message}`);
    return;
  }

  // 3. Fetch leads from Apollo page by page until we hit the cap
  const newLeads = [];
  let page = 1;
  let apolloError = null;

  try {
    while (newLeads.length < CONFIG.maxLeadsPerRun) {
      console.log(`  Fetching Apollo page ${page}…`);
      const data = await searchApolloLeads(page);
      const people = data.people || [];

      if (people.length === 0) {
        console.log('  No more results from Apollo.');
        break;
      }

      for (const person of people) {
        if (newLeads.length >= CONFIG.maxLeadsPerRun) break;

        const lead = mapToLead(person);

        // Must have a phone number — skip if none
        if (!lead.phone) continue;

        // Must have a business name
        if (!lead.businessName) continue;

        // Skip duplicates
        const key = lead.businessName.toLowerCase();
        if (existing.has(key)) {
          console.log(`  ⤷ Skip (already exists): ${lead.businessName}`);
          continue;
        }

        newLeads.push(lead);
        existing.add(key); // prevent within-run dupes across pages
      }

      const pagination = data.pagination || {};
      if (page >= (pagination.total_pages || 1)) break;
      page++;
    }

    console.log(`✓ Found ${newLeads.length} new leads with phone numbers`);
  } catch (err) {
    apolloError = err.response?.data?.error || err.message;
    console.error(`✗ Apollo search error on page ${page}: ${apolloError}`);
    // Fall through — still write whatever we collected before the error
  }

  // 4. Write to Google Sheets
  if (newLeads.length === 0) {
    const msg = apolloError
      ? `Apollo error: ${apolloError}. No leads written.`
      : 'Apollo returned 0 new leads with phone numbers. Nothing written to sheet.';
    logError(msg);
    return;
  }

  try {
    await appendLeads(sheets, newLeads);
    console.log(`✓ Appended ${newLeads.length} leads to spreadsheet`);
    newLeads.forEach(l =>
      console.log(`  + ${l.businessName} | ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`)
    );
  } catch (err) {
    logError(`Failed to write to Google Sheets — ${err.message}`);
    return;
  }

  if (apolloError) {
    // We wrote partial results — still notify about the Apollo error
    logError(`Apollo error occurred mid-run (page ${page}): ${apolloError}. Wrote ${newLeads.length} partial results.`);
  }

  console.log(`[${new Date().toISOString()}] ─── Run complete ───\n`);
}

// ─── ERROR LOGGING & ALERTS ───────────────────────────────────────────────────

/**
 * Log an error to the console. If SENDGRID_API_KEY is set, also sends an
 * email to CONFIG.notificationEmail so you know to check manually.
 */
function logError(message) {
  const entry = `[ERROR ${new Date().toISOString()}] ${message}`;
  console.error(entry);

  if (process.env.SENDGRID_API_KEY) {
    sendEmailAlert(message).catch(e => console.error('Email alert failed:', e.message));
  }
}

async function sendEmailAlert(message) {
  await axios.post(
    'https://api.sendgrid.com/v3/mail/send',
    {
      personalizations: [{ to: [{ email: CONFIG.notificationEmail }] }],
      from: { email: CONFIG.notificationEmail },
      subject: '⚠ HVAC Lead Generator — Run Error',
      content: [{ type: 'text/plain', value: message }],
    },
    { headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` } }
  );
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────

// 7:00 AM Eastern every day (node-cron handles EST ↔ EDT automatically)
cron.schedule('0 7 * * *', runWorkflow, { timezone: 'America/New_York' });

console.log('HVAC Lead Generator running.');
console.log('Scheduled: 7:00 AM Eastern, every day.');
console.log('Pass --verify to run immediately and confirm connectivity.\n');

// ─── FIRST-RUN VERIFICATION ───────────────────────────────────────────────────

if (process.argv.includes('--verify')) {
  console.log('── Verify mode: running immediately ──\n');
  runWorkflow()
    .then(() => {
      console.log('\n── Verify complete ──');
      console.log('If you saw ✓ marks for Google Sheets and Apollo above, the workflow is ready.');
      console.log('Leave this running (without --verify) and it will fire daily at 7 AM ET.');
    })
    .catch(err => {
      console.error('Unexpected error during verify run:', err.message);
      process.exit(1);
    });
}
