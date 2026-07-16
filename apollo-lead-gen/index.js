/**
 * Apollo.io → Google Sheets Lead Generation
 * Targets HVAC / Plumbing / Mechanical companies in Southwest Michigan.
 * Runs on a cron schedule (default: 7:00am Eastern daily).
 *
 * ENV VARS REQUIRED — see .env.example
 */

require('dotenv').config();
const axios       = require('axios');
const { google }  = require('googleapis');
const cron        = require('node-cron');
const nodemailer  = require('nodemailer');
const fs          = require('fs');

// ============================================================
// CONFIGURATION — Edit here to change cities, titles, limits
// ============================================================
const CONFIG = {
  // Southwest Michigan target cities — add / remove freely
  cities: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // Industry keywords sent to Apollo — change vertical here
  industryKeywords: [
    'HVAC',
    'heating',
    'air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // Decision-maker titles in priority order
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // 1–25 employees = owner-operated small businesses
  employeeRanges: ['1,25'],

  // Max new leads written per scheduled run
  maxLeadsPerRun: 25,

  // Google Sheet tab name (must match exactly)
  sheetName: 'Leads',

  // 7:00am Eastern every morning — adjust via https://crontab.guru
  cronSchedule: '0 7 * * *',
  timezone:     'America/New_York',

  // Column order in the sheet — reorder here if you restructure columns
  columnHeaders: [
    'Date Added',
    'Business Name',
    'Owner First Name',
    'Owner Last Name',
    'Phone Number',
    'City',
    'Website',
    'Called',
    'Notes',
  ],
};

// ============================================================
// APOLLO.IO
// ============================================================

async function searchApolloLeads(limit) {
  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      api_key:                          process.env.APOLLO_API_KEY,
      page:                             1,
      per_page:                         Math.min(limit, 100), // Apollo cap per page
      person_titles:                    CONFIG.jobTitles,
      person_locations:                 CONFIG.cities,
      organization_num_employees_ranges: CONFIG.employeeRanges,
      q_organization_keyword_tags:      CONFIG.industryKeywords,
      // Only contacts Apollo has phone data for
      contact_email_status:             ['verified', 'unverified', 'likely_to_engage'],
    },
    {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30_000,
    }
  );

  if (!response.data?.people) {
    throw new Error(`Unexpected Apollo response: ${JSON.stringify(response.data)}`);
  }

  return response.data.people;
}

// Phone priority: mobile > direct > work HQ > anything available
function extractBestPhone(person) {
  const phones = person.phone_numbers ?? [];
  const priority = ['mobile', 'direct', 'work_hq', 'work'];

  for (const type of priority) {
    const match = phones.find(p => p.type === type && (p.sanitized_number || p.raw_number));
    if (match) return match.sanitized_number ?? match.raw_number;
  }

  const fallback = phones.find(p => p.sanitized_number ?? p.raw_number);
  return fallback ? (fallback.sanitized_number ?? fallback.raw_number) : null;
}

function mapPersonToRow(person) {
  return {
    dateAdded:    new Date().toLocaleDateString('en-US'),
    businessName: person.organization?.name ?? '',
    firstName:    person.first_name ?? '',
    lastName:     person.last_name  ?? '',
    phone:        extractBestPhone(person) ?? '',
    city:         person.city ?? person.organization?.city ?? '',
    website:      person.organization?.website_url ?? '',
  };
}

// ============================================================
// GOOGLE SHEETS
// ============================================================

async function getSheetsClient() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
  } else {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON or ' +
      'GOOGLE_SERVICE_ACCOUNT_KEY_PATH in your .env file.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Ensure header row exists; create it if the sheet is completely empty
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${CONFIG.sheetName}!A1:I1`,
  });

  const existing = res.data.values?.[0] ?? [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId:   process.env.GOOGLE_SHEET_ID,
      range:           `${CONFIG.sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [CONFIG.columnHeaders] },
    });
    console.log('✓ Header row created in sheet');
  }
}

// Returns a Set of existing business names (lowercase) for O(1) duplicate checks
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${CONFIG.sheetName}!B:B`, // Business Name column
  });

  const rows = res.data.values ?? [];
  return new Set(rows.slice(1).map(r => (r[0] ?? '').trim().toLowerCase()));
}

async function appendRows(sheets, leads) {
  const values = leads.map(l => [
    l.dateAdded,    // A: Date Added
    l.businessName, // B: Business Name
    l.firstName,    // C: Owner First Name
    l.lastName,     // D: Owner Last Name
    l.phone,        // E: Phone Number
    l.city,         // F: City
    l.website,      // G: Website
    '',             // H: Called     (intentionally blank)
    '',             // I: Notes      (intentionally blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId:   process.env.GOOGLE_SHEET_ID,
    range:           `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

// ============================================================
// ERROR NOTIFICATION
// ============================================================

async function notify(subject, body) {
  console.error(`\n[ERROR] ${subject}\n${body}\n`);

  if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.NOTIFICATION_EMAIL) {
    try {
      const transport = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({
        from:    process.env.SMTP_USER,
        to:      process.env.NOTIFICATION_EMAIL,
        subject: `[Lead Gen Alert] ${subject}`,
        text:    body,
      });
      console.log(`Email alert sent to ${process.env.NOTIFICATION_EMAIL}`);
    } catch (err) {
      console.error('Failed to send email alert:', err.message);
    }
  }
}

// ============================================================
// MAIN RUN
// ============================================================

async function run() {
  const ts = new Date().toISOString();
  console.log(`\n${'='.repeat(55)}`);
  console.log(`Lead Gen Run — ${ts}`);
  console.log('='.repeat(55));

  // — Google Sheets client
  let sheets;
  try {
    sheets = await getSheetsClient();
    console.log('✓ Google Sheets connected');
  } catch (err) {
    await notify(
      'Google Sheets connection failed',
      `Time: ${ts}\nError: ${err.message}\n\nCheck your service account credentials.`
    );
    return;
  }

  // — Ensure header row
  try {
    await ensureHeaders(sheets);
  } catch (err) {
    await notify('Could not verify/create header row', `Error: ${err.message}`);
    return;
  }

  // — Read existing leads for deduplication
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`✓ ${existingNames.size} existing leads loaded for dedup check`);
  } catch (err) {
    await notify(
      'Google Sheets read failed',
      `Time: ${ts}\nSheet ID: ${process.env.GOOGLE_SHEET_ID}\nError: ${err.message}`
    );
    return;
  }

  // — Apollo search (pull 2× to have buffer after filtering)
  let apolloPeople;
  try {
    apolloPeople = await searchApolloLeads(CONFIG.maxLeadsPerRun * 2);
    console.log(`✓ Apollo returned ${apolloPeople.length} contacts`);
  } catch (err) {
    await notify(
      'Apollo.io search failed',
      `Time: ${ts}\nError: ${err.response?.data?.error || err.message}\n\nCheck APOLLO_API_KEY and monthly quota.`
    );
    return;
  }

  if (apolloPeople.length === 0) {
    await notify(
      'Apollo returned 0 results',
      `Time: ${ts}\n\nPossible causes:\n- Search filters too narrow\n- Monthly API quota exhausted\n- Apollo has no indexed contacts for these criteria`
    );
    return;
  }

  // — Map, filter, deduplicate
  const newLeads = [];

  for (const person of apolloPeople) {
    if (newLeads.length >= CONFIG.maxLeadsPerRun) break;

    const row = mapPersonToRow(person);

    if (!row.businessName)                                           continue; // skip ghost orgs
    if (!row.phone)                                                  continue; // no phone = skip
    if (existingNames.has(row.businessName.trim().toLowerCase()))   continue; // duplicate

    newLeads.push(row);
    existingNames.add(row.businessName.trim().toLowerCase()); // prevent intra-batch dupes
  }

  console.log(`✓ ${newLeads.length} new unique leads ready`);

  if (newLeads.length === 0) {
    console.log('Nothing to add — all Apollo results were duplicates or missing phone numbers.');
    return;
  }

  // — Write to sheet
  try {
    await appendRows(sheets, newLeads);
    console.log(`✓ Appended ${newLeads.length} rows to "${CONFIG.sheetName}"`);
  } catch (err) {
    await notify(
      'Google Sheets write failed',
      `Time: ${ts}\nLeads lost: ${newLeads.length}\nError: ${err.message}`
    );
    return;
  }

  // — Summary
  console.log('\nLeads added this run:');
  newLeads.forEach((l, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${l.businessName.padEnd(35)} ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`);
  });

  console.log(`\n✓ Done — ${newLeads.length} new leads added`);
}

// ============================================================
// STARTUP VALIDATION
// ============================================================

async function validateAndStart() {
  console.log('\n=== Validating environment ===');

  // Required env vars
  const required = {
    APOLLO_API_KEY:  process.env.APOLLO_API_KEY,
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  };
  const googleCred =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

  let valid = true;
  for (const [key, val] of Object.entries(required)) {
    if (!val) { console.error(`  ✗ Missing: ${key}`); valid = false; }
    else       { console.log (`  ✓ ${key}`); }
  }
  if (!googleCred) {
    console.error('  ✗ Missing Google credentials (GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_PATH)');
    valid = false;
  } else {
    console.log('  ✓ Google credentials present');
  }

  if (!valid) {
    console.error('\nFix the missing env vars in your .env file, then restart.\n');
    process.exit(1);
  }

  // Live Apollo test
  console.log('\n--- Testing Apollo.io API ---');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key:        process.env.APOLLO_API_KEY,
        page:           1,
        per_page:       1,
        person_titles:  ['Owner'],
        person_locations: ['Kalamazoo, Michigan, United States'],
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
    );
    const total = res.data?.pagination?.total_entries ?? '?';
    console.log(`  ✓ Apollo connected — ~${total} total contacts available for test query`);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error(`  ✗ Apollo test failed: ${msg}`);
    console.error('  → Verify APOLLO_API_KEY, then restart.\n');
    process.exit(1);
  }

  // Live Google Sheets test
  console.log('\n--- Testing Google Sheets ---');
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
    console.log(`  ✓ Google Sheets connected — spreadsheet accessible`);
  } catch (err) {
    console.error(`  ✗ Google Sheets test failed: ${err.message}`);
    console.error('  → Check GOOGLE_SHEET_ID and that the sheet is shared with your service account.\n');
    process.exit(1);
  }

  console.log('\n=== All connections OK ===\n');

  // Immediate first run
  await run();

  // Schedule subsequent runs
  console.log(`\nScheduler armed — next run at 7:00am Eastern (${CONFIG.cronSchedule} ${CONFIG.timezone})`);
  console.log('Leave this terminal open or run via PM2 / systemd to keep the scheduler alive.\n');

  cron.schedule(CONFIG.cronSchedule, run, { timezone: CONFIG.timezone });
}

validateAndStart().catch(err => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
