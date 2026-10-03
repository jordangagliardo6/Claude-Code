/**
 * HVAC Lead Generation Workflow — SW Michigan
 *
 * Runs daily at 7am ET (via node-cron). Searches Apollo.io for HVAC/plumbing
 * companies in SW Michigan, deduplicates against the master Google Sheet, and
 * appends up to MAX_NEW_LEADS new rows.
 *
 * First-run setup (one-time):
 *   1. cp .env.example .env  and fill in all values
 *   2. npm install
 *   3. To get your Google refresh token run:
 *        node src/getGoogleToken.js
 *   4. npm start  (starts the cron; or node src/leadWorkflow.js --run-once)
 */

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');

// ─── Configuration ────────────────────────────────────────────────────────────

const APOLLO_API_KEY  = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID  = process.env.SPREADSHEET_ID;
const SHEET_NAME      = 'Sheet1'; // change if your tab has a different name
const MAX_NEW_LEADS   = 25;

// Cities to search (add/remove as needed)
const TARGET_CITIES = [
  'St. Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
  'Grand Haven', 'Muskegon', 'South Haven',
];

// Apollo industry keywords (used in q_organization_keyword_tags)
const INDUSTRY_TAGS = [
  'hvac', 'heating', 'air conditioning', 'plumbing', 'mechanical contracting',
];

// Owner-level titles in priority order (used when Apollo returns people data)
const OWNER_TITLES = ['owner', 'president', 'founder', 'co-founder', 'general manager'];

// Google Sheets column order — must match the sheet header
const SHEET_COLUMNS = [
  'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
  'Phone Number', 'City', 'Website', 'Called', 'Notes',
];

// ─── Google Auth ──────────────────────────────────────────────────────────────

function buildGoogleAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

async function getExistingBusinessNames(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B2:B`, // Business Name column
  });
  const rows = res.data.values || [];
  return new Set(rows.map(r => normalizeBusinessName(r[0] || '')));
}

async function appendRows(auth, rows) {
  if (rows.length === 0) return;
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─── Apollo.io REST API helpers ───────────────────────────────────────────────

async function apolloSearchOrganizations(city, page = 1) {
  // Apollo mixed companies search — requires REST API key with search access
  const response = await axios.post(
    'https://api.apollo.io/api/v1/mixed_companies/search',
    {
      api_key: APOLLO_API_KEY,
      q_organization_keyword_tags: INDUSTRY_TAGS,
      organization_locations: [`${city}, Michigan, United States`],
      organization_num_employees_ranges: ['1,25'],
      page,
      per_page: 25,
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  return response.data;
}

async function apolloSearchPeopleForOrg(organizationId) {
  // Find owner-level contacts for a given org
  const response = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    {
      api_key: APOLLO_API_KEY,
      organization_ids: [organizationId],
      person_titles: OWNER_TITLES,
      contact_phone_numbers_exist: true,
      per_page: 5,
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  return response.data.people || [];
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function normalizeBusinessName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function pickBestPhone(org, people) {
  // Prefer a direct mobile/phone from an owner-level person
  for (const person of people) {
    const nums = person.phone_numbers || [];
    const direct = nums.find(p => p.type === 'direct' || p.type === 'mobile');
    if (direct?.sanitized_number) return direct.sanitized_number;
    if (nums[0]?.sanitized_number) return nums[0].sanitized_number;
  }
  // Fall back to the corporate number on the org
  return org.primary_phone?.number || org.sanitized_phone || '';
}

function pickOwner(people) {
  for (const title of OWNER_TITLES) {
    const match = people.find(p =>
      (p.title || '').toLowerCase().includes(title),
    );
    if (match) return { first: match.first_name || '', last: match.last_name || '' };
  }
  return { first: '', last: '' };
}

// ─── Core workflow ────────────────────────────────────────────────────────────

async function runOnce() {
  console.log(`[${new Date().toISOString()}] Starting lead run…`);

  const auth = buildGoogleAuth();

  // 1. Load existing business names to avoid duplicates
  console.log('Reading existing leads from Google Sheets…');
  const existing = await getExistingBusinessNames(auth);
  console.log(`  ${existing.size} existing leads loaded.`);

  const newRows = [];

  // 2. Search each city in turn until we hit MAX_NEW_LEADS
  outer: for (const city of TARGET_CITIES) {
    if (newRows.length >= MAX_NEW_LEADS) break;

    let page = 1;
    let hasMore = true;

    while (hasMore && newRows.length < MAX_NEW_LEADS) {
      console.log(`  Searching ${city} (page ${page})…`);
      let data;
      try {
        data = await apolloSearchOrganizations(city, page);
      } catch (err) {
        console.error(`  Apollo search error for ${city}:`, err.response?.data || err.message);
        break;
      }

      const orgs = data.organizations || data.accounts || [];
      hasMore = orgs.length === 25; // full page → more might exist
      page++;

      for (const org of orgs) {
        if (newRows.length >= MAX_NEW_LEADS) break outer;

        const bizName = org.name || '';
        if (!bizName || existing.has(normalizeBusinessName(bizName))) continue;

        // 3. Try to find owner + direct phone via People search
        let people = [];
        try {
          people = await apolloSearchPeopleForOrg(org.id);
        } catch (_) {
          // non-fatal — we'll fall back to the corporate number
        }

        const phone = pickBestPhone(org, people);
        if (!phone) continue; // skip if no phone at all

        const owner = pickOwner(people);
        const website = org.website_url || org.primary_domain
          ? `http://${org.primary_domain}`
          : '';

        const row = [
          today(),
          bizName,
          owner.first,
          owner.last,
          phone,
          city,
          website,
          '', // Called — blank
          '', // Notes — blank
        ];
        newRows.push(row);
        existing.add(normalizeBusinessName(bizName)); // prevent intra-run dupes
        console.log(`  + ${bizName} (${city})`);
      }
    }
  }

  // 4. Append to sheet
  if (newRows.length > 0) {
    console.log(`Appending ${newRows.length} new leads to Google Sheets…`);
    await appendRows(auth, newRows);
    console.log('Done.');
  } else {
    console.log('No new leads found this run.');
  }

  return newRows.length;
}

async function runWithErrorHandling() {
  try {
    const count = await runOnce();
    console.log(`[${new Date().toISOString()}] Run complete — ${count} leads added.`);
  } catch (err) {
    const msg = err?.message || String(err);
    console.error(`[${new Date().toISOString()}] Run failed:`, msg);
    await sendFailureEmail(msg).catch(e => console.error('Email send failed:', e.message));
  }
}

// ─── Failure notification ─────────────────────────────────────────────────────

async function sendFailureEmail(errorMessage) {
  const notifEmail = process.env.NOTIFICATION_EMAIL;
  if (!notifEmail) return;

  const auth = buildGoogleAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const subject = 'HVAC Lead Workflow — Run Failed';
  const body = `The HVAC lead workflow failed at ${new Date().toISOString()}.\n\nError:\n${errorMessage}`;
  const raw = Buffer.from(
    `To: ${notifEmail}\r\nSubject: ${subject}\r\nContent-Type: text/plain\r\n\r\n${body}`,
  ).toString('base64url');

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  console.log(`Failure notification sent to ${notifEmail}.`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const runOnceFlag = process.argv.includes('--run-once');

if (runOnceFlag) {
  // Manual / test run
  runWithErrorHandling();
} else {
  // Scheduled: 7am ET daily  (cron runs in server local time — deploy in ET or
  // adjust the expression: '0 12 * * *' for 7am ET from a UTC server)
  const CRON_EXPR = '0 7 * * *';
  console.log(`Scheduler started. Next run at 7:00 AM (server local time) — cron: ${CRON_EXPR}`);
  cron.schedule(CRON_EXPR, runWithErrorHandling, { timezone: 'America/New_York' });
}
