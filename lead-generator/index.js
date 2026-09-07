// ─────────────────────────────────────────────────────────────────────────────
// HVAC Lead Generator — Southwest Michigan
// Searches Apollo.io for HVAC decision-makers and appends new leads to Google
// Sheets. Runs on a daily cron at 7am Eastern Time.
//
// Usage:
//   node index.js --verify    Verify API connections before first scheduled run
//   node index.js --run-now   Run the workflow once immediately (for testing)
//   node index.js             Start the daily 7am scheduler
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const cron = require('node-cron');

// ─────────────────────────────────────────
// CONFIGURATION — edit these as needed
// ─────────────────────────────────────────

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
    'Stevensville, Michigan',
    'Coloma, Michigan',
    'Three Rivers, Michigan',
    'Paw Paw, Michigan',
    'Watervliet, Michigan',
    'Mattawan, Michigan',
    'Portage, Michigan',
    'Vicksburg, Michigan',
    'Lawton, Michigan',
    'Hartford, Michigan',
    'Dowagiac, Michigan',
  ],

  // Industry keywords used to filter Apollo company results
  industryKeywords: [
    'HVAC',
    'heating and cooling',
    'air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // Job titles to target, in priority order (Owner first)
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Company size: only owner-operated small businesses (1–25 employees)
  employeeRange: '1,25',

  // Maximum new leads added per scheduled run (keeps the list manageable)
  maxLeadsPerRun: 25,

  // Google Sheets spreadsheet ID — found in the URL:
  //   docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
  spreadsheetId:
    process.env.SPREADSHEET_ID ||
    '1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo',

  // Name of the sheet tab inside the spreadsheet
  sheetName: 'Sheet1',

  // Cron schedule for 7am Eastern Time.
  // Eastern is UTC-5 (EST) or UTC-4 (EDT). Adjust as needed for DST.
  // '0 12 * * *' = noon UTC = 7am EST  (Nov–Mar)
  // '0 11 * * *' = 11am UTC = 7am EDT  (Mar–Nov)
  cronSchedule: process.env.CRON_SCHEDULE || '0 12 * * *',
};

// ─────────────────────────────────────────
// APOLLO.IO SEARCH
//
// NOTE: The /api/v1/mixed_people/search endpoint requires a paid Apollo plan
// (Professional or above). A free plan will return an API_INACCESSIBLE error.
// Upgrade at: https://www.apollo.io/pricing
// ─────────────────────────────────────────

async function searchApolloLeads(page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const payload = {
    api_key: apiKey,
    page,
    per_page: CONFIG.maxLeadsPerRun,
    // Person filters
    person_titles: CONFIG.jobTitles,
    person_seniorities: ['owner', 'c_suite'],
    person_locations: CONFIG.cities,
    include_similar_titles: false,
    // Company filters
    organization_locations: ['Michigan, United States'],
    q_organization_keyword_tags: CONFIG.industryKeywords,
    organization_num_employees_ranges: [CONFIG.employeeRange],
  };

  const response = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 15000,
    }
  );

  const people = response.data?.people || [];
  if (people.length === 0) {
    console.log('  Apollo returned 0 results.');
    return [];
  }

  // Map Apollo fields to the spreadsheet column structure
  return people.map((person) => ({
    dateAdded: new Date().toISOString().split('T')[0],
    businessName: person.organization?.name || '',
    ownerFirstName: person.first_name || '',
    // Apollo may partially mask last names on some plans; enrichment reveals full names
    ownerLastName: person.last_name || '',
    // Direct/mobile phone comes from enrichment credits; raw search results often lack it.
    // Apollo bulk enrichment (apollo_people_bulk_match) unlocks phone numbers.
    phone:
      person.sanitized_phone ||
      person.phone_numbers?.[0]?.raw_number ||
      person.mobile_phone ||
      '',
    city:
      person.city ||
      person.organization?.city ||
      '',
    website: person.organization?.website_url || '',
    called: '',
    notes: '',
  }));
}

// ─────────────────────────────────────────
// GOOGLE SHEETS CLIENT
//
// Supports two authentication methods:
//   A) Service Account (recommended for scheduled automation — no user needed)
//   B) OAuth2 (requires one-time browser authorization)
// ─────────────────────────────────────────

function getGoogleSheetsClient() {
  // Option A: Service Account
  // 1. Create a service account in Google Cloud Console > IAM & Admin > Service Accounts
  // 2. Download the JSON key and set GOOGLE_SERVICE_ACCOUNT_KEY_FILE to its path
  // 3. Share your Google Sheet with the service account email (editor access)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
  }

  // Option B: OAuth2
  // 1. Create OAuth2 credentials in Google Cloud Console > APIs & Services > Credentials
  // 2. Run the one-time auth flow (see README for helper script)
  // 3. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
    return google.sheets({ version: 'v4', auth: oauth2Client });
  }

  throw new Error(
    'No Google credentials configured.\n' +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE  (Option A — recommended)\n' +
      '  OR  GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (Option B)'
  );
}

// Read all existing business names from column B to detect duplicates
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!B:B`,
  });
  const rows = res.data.values || [];
  // Skip header row; normalize to lowercase for case-insensitive dedup
  return new Set(rows.slice(1).map((r) => (r[0] || '').toLowerCase().trim()));
}

// Append rows to the spreadsheet after the last occupied row
async function appendLeadsToSheet(sheets, leads) {
  if (leads.length === 0) return;
  const rows = leads.map((l) => [
    l.dateAdded,
    l.businessName,
    l.ownerFirstName,
    l.ownerLastName,
    l.phone,
    l.city,
    l.website,
    l.called,  // left blank — user fills in after calling
    l.notes,   // left blank — user fills in notes
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─────────────────────────────────────────
// MAIN WORKFLOW
// ─────────────────────────────────────────

async function runWorkflow() {
  const runTime = new Date().toISOString();
  console.log(`\n[${runTime}] ── Starting HVAC lead generation run ──`);

  // 1. Search Apollo
  console.log('\n1. Searching Apollo.io for Southwest Michigan HVAC decision-makers...');
  let apolloLeads;
  try {
    apolloLeads = await searchApolloLeads();
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    const isFreePlan = err.response?.status === 422 || msg?.includes('not included in your');
    console.error(`\n❌ Apollo search failed: ${msg}`);
    if (isFreePlan) {
      console.error(
        '   Your Apollo plan does not include API access.\n' +
          '   Upgrade to a paid plan at https://www.apollo.io/pricing'
      );
    }
    console.error('   Skipping Google Sheets update for this run.');
    return;
  }
  console.log(`   Found ${apolloLeads.length} candidate(s) from Apollo.`);

  if (apolloLeads.length === 0) {
    console.log('   Nothing to add. Run complete.');
    return;
  }

  // 2. Connect to Google Sheets and load existing names
  console.log('\n2. Connecting to Google Sheets and loading existing entries...');
  let sheets, existingNames;
  try {
    sheets = getGoogleSheetsClient();
    existingNames = await getExistingBusinessNames(sheets);
  } catch (err) {
    console.error(`\n❌ Google Sheets connection failed: ${err.message}`);
    console.error('   Check your Google credentials in .env and retry.');
    return;
  }
  console.log(`   Spreadsheet has ${existingNames.size} existing business(es).`);

  // 3. Deduplicate by business name (case-insensitive)
  const newLeads = apolloLeads.filter(
    (l) => l.businessName && !existingNames.has(l.businessName.toLowerCase().trim())
  );
  console.log(`\n3. Duplicate check: ${apolloLeads.length - newLeads.length} already in sheet, ${newLeads.length} new.`);

  // 4. Drop contacts with no phone number
  const leadsWithPhone = newLeads.filter((l) => l.phone && l.phone.trim() !== '');
  const dropped = newLeads.length - leadsWithPhone.length;
  if (dropped > 0) console.log(`   Dropped ${dropped} lead(s) with no phone number.`);

  // 5. Cap at maxLeadsPerRun
  const toAdd = leadsWithPhone.slice(0, CONFIG.maxLeadsPerRun);

  // 6. Append to sheet
  console.log(`\n4. Appending ${toAdd.length} new lead(s) to the spreadsheet...`);
  if (toAdd.length > 0) {
    try {
      await appendLeadsToSheet(sheets, toAdd);
      console.log(`\n✅ Done! Added ${toAdd.length} new lead(s):`);
      toAdd.forEach((l) =>
        console.log(`   • ${l.businessName || '(no name)'} — ${l.city} — ${l.phone}`)
      );
    } catch (err) {
      console.error(`\n❌ Google Sheets write failed: ${err.message}`);
      console.error('   The Apollo search succeeded but leads were NOT written to the sheet.');
      console.error('   Leads that were ready to be added:');
      toAdd.forEach((l) => console.error(`   • ${l.businessName} — ${l.city} — ${l.phone}`));
    }
  } else {
    console.log('   No new leads with phone numbers to add today.');
  }

  console.log(`\n[${new Date().toISOString()}] Run complete.\n`);
}

// ─────────────────────────────────────────
// CONNECTION VERIFY
// Run `npm run verify` before the first scheduled run to confirm both APIs work
// ─────────────────────────────────────────

async function verifyConnections() {
  console.log('\n🔍 Verifying API connections...\n');
  let allOk = true;

  // Apollo health check
  process.stdout.write('  Apollo.io...    ');
  if (!process.env.APOLLO_API_KEY) {
    console.log('❌  APOLLO_API_KEY is not set in .env');
    allOk = false;
  } else {
    try {
      await axios.get('https://api.apollo.io/api/v1/auth/health', {
        params: { api_key: process.env.APOLLO_API_KEY },
        timeout: 8000,
      });
      console.log('✅  Connected');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message;
      if (status === 401) {
        console.log('❌  Invalid API key — check APOLLO_API_KEY in .env');
      } else {
        console.log(`❌  ${msg}`);
      }
      allOk = false;
    }
  }

  // Google Sheets check
  process.stdout.write('  Google Sheets... ');
  try {
    const sheets = getGoogleSheetsClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: CONFIG.spreadsheetId,
      fields: 'properties.title',
    });
    console.log(`✅  Connected — "${meta.data.properties.title}"`);
  } catch (err) {
    console.log(`❌  ${err.message}`);
    allOk = false;
  }

  console.log('');
  if (allOk) {
    console.log('✅  All connections verified. Starting scheduler...\n');
  } else {
    console.error('❌  Fix the issues above, then re-run `npm run verify`.\n');
    process.exit(1);
  }
}

// ─────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);

  if (args.includes('--run-now')) {
    // One-shot run for testing; exits when done
    await runWorkflow();
    process.exit(0);
  }

  if (args.includes('--verify')) {
    await verifyConnections();
    // Fall through to start the scheduler so one command does verify + start
  }

  // Start the daily cron
  console.log(
    `\n⏰  Scheduler started — running at cron "${CONFIG.cronSchedule}" (default: 7am EST).` +
      `\n    Spreadsheet: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit\n`
  );

  cron.schedule(
    CONFIG.cronSchedule,
    async () => {
      try {
        await runWorkflow();
      } catch {
        // runWorkflow logs its own errors; keep the process alive for the next scheduled run
      }
    },
    {
      timezone: 'America/New_York', // Handles EST/EDT automatically
    }
  );
})();
