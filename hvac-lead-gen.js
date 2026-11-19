/**
 * HVAC Lead Generation Workflow
 * ─────────────────────────────
 * Searches Apollo.io for HVAC owner contacts in SW Michigan and appends
 * new leads to a Google Sheet. Runs automatically every morning at 7am ET.
 *
 * Usage:
 *   node hvac-lead-gen.js            → starts the scheduler (keeps running)
 *   node hvac-lead-gen.js --once     → runs one fetch immediately and exits
 *   node hvac-lead-gen.js --test     → verifies API connections and exits
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

// ── Configuration ─────────────────────────────────────────────────────────────
// Edit these to change cities, industries, titles, or lead limits.

const CONFIG = {
  // Target cities — add or remove as needed
  cities: [
    'St. Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
    'Grand Haven', 'Muskegon', 'South Haven',
  ],

  // Apollo industry keywords — drives the company filter
  industries: [
    'HVAC', 'Heating and Air Conditioning', 'Plumbing', 'Mechanical Contracting',
  ],

  // Job titles to target, in priority order
  targetTitles: [
    'Owner', 'President', 'Founder', 'Co-Founder', 'General Manager',
  ],

  // Max leads to add per run so the list stays manageable
  maxLeadsPerRun: 25,

  // Google Sheet to append to
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8',
  sheetName: process.env.GOOGLE_SHEET_NAME || 'Untitled',

  // Cron schedule: "0 7 * * *" = 7:00 AM every day.
  // The timezone below ensures it fires at 7am Eastern.
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',
};

// Column order in the spreadsheet (do not reorder without updating the append logic below)
const COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  ← left blank by this script
  'Notes',            // I  ← left blank by this script
];

// ── Apollo.io ─────────────────────────────────────────────────────────────────

async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in your .env file.');

  // Build a location string Apollo understands ("City, Michigan, United States" or just the state)
  // We search at the state level and post-filter by city so Apollo's pagination works cleanly.
  const payload = {
    api_key: apiKey,
    // People filter: must have a direct or mobile phone number
    contact_phone_required: true,
    // Company location: Michigan
    organization_locations: ['Michigan, United States'],
    // Company headcount 1–25 (owner-operated small businesses)
    organization_num_employees_ranges: ['1,25'],
    // Industry keywords
    q_organization_keyword_tags: CONFIG.industries,
    // Job titles (Apollo matches any of these)
    person_titles: CONFIG.targetTitles,
    // Pull up to 100 candidates so we have room to filter duplicates and still hit 25
    per_page: 100,
    page: 1,
  };

  console.log('[Apollo] Searching for HVAC leads in SW Michigan…');

  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    payload,
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } }
  );

  const people = response.data?.people || [];
  console.log(`[Apollo] Found ${people.length} candidates before deduplication.`);
  return people;
}

function normalizeApolloContact(person) {
  // Map an Apollo people record to our spreadsheet column structure.
  const org = person.organization || {};

  // Pick the best available phone number (mobile preferred, then direct, then company)
  const phone =
    person.mobile_phone ||
    person.phone_numbers?.find(p => p.type === 'direct_dial')?.sanitized_number ||
    person.phone_numbers?.[0]?.sanitized_number ||
    org.phone ||
    '';

  // City from person's location, then company location
  const city =
    person.city ||
    org.city ||
    '';

  return {
    dateAdded: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    businessName: org.name || person.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: phone,
    city: city,
    website: org.website_url || '',
  };
}

// ── Google Sheets ─────────────────────────────────────────────────────────────

async function getGoogleSheetsClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './credentials/service-account.json';
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function readExistingBusinessNames(sheets) {
  // Reads column B (Business Name) to build a deduplication set.
  const range = `${CONFIG.sheetName}!B2:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range,
  });
  const rows = res.data.values || [];
  // Normalize to lowercase for case-insensitive comparison
  return new Set(rows.map(row => (row[0] || '').trim().toLowerCase()));
}

async function appendLeadsToSheet(sheets, leads) {
  if (leads.length === 0) {
    console.log('[Sheets] No new leads to append.');
    return 0;
  }

  const rows = leads.map(lead => [
    lead.dateAdded,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank
    '', // Notes — left blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${leads.length} new leads.`);
  return leads.length;
}

// ── Error notifications ───────────────────────────────────────────────────────

async function sendErrorNotification(subject, errorMessage) {
  // Always log to console so server logs capture it
  console.error(`[ERROR] ${subject}: ${errorMessage}`);

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const toEmail = process.env.NOTIFICATION_EMAIL;

  if (!smtpUser || !smtpPass || !toEmail) {
    console.warn('[Notify] SMTP credentials not configured — skipping email alert.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${smtpUser}>`,
      to: toEmail,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `The automated HVAC lead generation workflow encountered an error:\n\n${errorMessage}\n\nCheck the server logs for more detail.`,
    });

    console.log(`[Notify] Error alert sent to ${toEmail}`);
  } catch (mailErr) {
    console.error('[Notify] Failed to send email alert:', mailErr.message);
  }
}

// ── Main workflow ─────────────────────────────────────────────────────────────

async function runWorkflow() {
  const runLabel = `[Run ${new Date().toISOString()}]`;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${runLabel} Starting HVAC lead generation…`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // 1. Fetch candidates from Apollo
    const people = await searchApolloLeads();

    if (people.length === 0) {
      await sendErrorNotification(
        'Apollo returned zero results',
        'The search returned no candidates. The Apollo API quota may be exhausted, the filters may be too narrow, or the API key is invalid.'
      );
      return;
    }

    // 2. Connect to Google Sheets and read existing business names
    let sheets;
    try {
      sheets = await getGoogleSheetsClient();
    } catch (authErr) {
      await sendErrorNotification(
        'Google Sheets auth failed',
        `Could not authenticate with the Google Sheets API: ${authErr.message}`
      );
      return;
    }

    let existingNames;
    try {
      existingNames = await readExistingBusinessNames(sheets);
      console.log(`[Sheets] ${existingNames.size} existing businesses loaded for dedup check.`);
    } catch (readErr) {
      await sendErrorNotification(
        'Google Sheets read failed',
        `Could not read existing entries from the spreadsheet: ${readErr.message}`
      );
      return;
    }

    // 3. Normalize and filter results
    const candidates = people
      .map(normalizeApolloContact)
      // Must have a phone number and a business name
      .filter(c => c.phone && c.businessName)
      // Must be in SW Michigan (city matches our target list, case-insensitive)
      .filter(c => {
        const cityLower = c.city.toLowerCase();
        return CONFIG.cities.some(target => cityLower.includes(target.toLowerCase()));
      })
      // Skip duplicates already in the sheet
      .filter(c => !existingNames.has(c.businessName.trim().toLowerCase()));

    // Sort by title priority: owners first, then presidents, etc.
    // Apollo doesn't expose title in the people object reliably, so we sort by
    // whether a first name is known (more complete record = higher priority).
    candidates.sort((a, b) => {
      const aScore = (a.firstName ? 1 : 0) + (a.lastName ? 1 : 0);
      const bScore = (b.firstName ? 1 : 0) + (b.lastName ? 1 : 0);
      return bScore - aScore;
    });

    // 4. Cap at the per-run limit
    const newLeads = candidates.slice(0, CONFIG.maxLeadsPerRun);

    console.log(`[Filter] ${candidates.length} unique new candidates found; capping at ${CONFIG.maxLeadsPerRun}.`);
    console.log(`[Filter] Will append ${newLeads.length} leads this run.`);

    if (newLeads.length === 0) {
      console.log('[Done] No new leads to add after deduplication.');
      return;
    }

    // 5. Append to Google Sheets
    try {
      await appendLeadsToSheet(sheets, newLeads);
    } catch (writeErr) {
      await sendErrorNotification(
        'Google Sheets write failed',
        `Leads were fetched from Apollo but could not be written to the spreadsheet: ${writeErr.message}`
      );
      return;
    }

    console.log(`\n${runLabel} ✓ Done. ${newLeads.length} leads added to the spreadsheet.`);

  } catch (err) {
    await sendErrorNotification(
      'Unexpected workflow error',
      err.stack || err.message
    );
  }
}

// ── Connection test ───────────────────────────────────────────────────────────

async function testConnections() {
  console.log('\n── Connection Test ──────────────────────────────────────────\n');

  // Test Apollo
  console.log('1. Testing Apollo.io API key…');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/auth/health',
      {},
      {
        headers: { 'Content-Type': 'application/json' },
        params: { api_key: process.env.APOLLO_API_KEY },
      }
    );
    const ok = res.data?.is_logged_in || res.status === 200;
    console.log(ok ? '   ✓ Apollo API key is valid.' : '   ✗ Apollo API returned an unexpected response.');
  } catch (err) {
    console.error('   ✗ Apollo connection failed:', err.response?.data || err.message);
  }

  // Test Google Sheets
  console.log('2. Testing Google Sheets connection…');
  try {
    const sheets = await getGoogleSheetsClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: CONFIG.spreadsheetId,
      fields: 'properties.title',
    });
    console.log(`   ✓ Connected to spreadsheet: "${meta.data.properties.title}"`);
  } catch (err) {
    console.error('   ✗ Google Sheets connection failed:', err.message);
    console.error('     → Make sure you shared the spreadsheet with your service account email.');
  }

  console.log('\n── Test complete. See above for any errors. ─────────────────\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test')) {
  testConnections().catch(err => {
    console.error('Test failed:', err.message);
    process.exit(1);
  });
} else if (args.includes('--once')) {
  // Run immediately one time and exit
  runWorkflow().then(() => {
    console.log('\nSingle run complete. Exiting.');
    process.exit(0);
  }).catch(err => {
    console.error('Workflow error:', err);
    process.exit(1);
  });
} else {
  // Scheduled mode: run once at startup, then follow the cron schedule
  console.log(`\nHVAC Lead Gen scheduler starting.`);
  console.log(`Schedule: ${CONFIG.cronSchedule} (${CONFIG.cronTimezone})`);
  console.log(`Spreadsheet: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit`);
  console.log(`\nRunning initial fetch now…`);

  runWorkflow();

  cron.schedule(CONFIG.cronSchedule, () => {
    runWorkflow();
  }, {
    timezone: CONFIG.cronTimezone,
  });

  console.log('\nScheduler is running. Press Ctrl+C to stop.\n');
}
