'use strict';

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const fs = require('fs');

// ── Configuration ─────────────────────────────────────────────────────────────
// Modify TARGET_CITIES or TARGET_TITLES to adjust your search scope.

const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

const INDUSTRY_TAGS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';
const MAX_LEADS_PER_RUN = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(tag, msg) {
  console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
}

// Normalize a business name for duplicate comparison
// Strips punctuation and extra whitespace, lowercases
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Format today's date as MM/DD/YYYY
function todayFormatted() {
  return new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

// Format today's date for the spreadsheet title, e.g. "Sept 20 2026"
function todayTitleFormatted() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Error email ───────────────────────────────────────────────────────────────

async function sendErrorEmail(subject, body) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL } = process.env;

  if (!SMTP_USER || !SMTP_PASS) {
    log('NOTIFY', `SMTP not configured. Error details:\n${body}`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(SMTP_PORT) || 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: NOTIFICATION_EMAIL || SMTP_USER,
      subject: `[HVAC Lead Bot] ${subject}`,
      text: `HVAC Lead Generation Workflow Alert\n\n${body}\n\nCheck your terminal logs for more detail.`,
    });

    log('NOTIFY', `Error email sent to ${NOTIFICATION_EMAIL}`);
  } catch (err) {
    log('NOTIFY', `Could not send email: ${err.message}`);
  }
}

// ── Google API auth ───────────────────────────────────────────────────────────

function getGoogleAuth() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  if (!fs.existsSync(credPath)) {
    throw new Error(`Google credentials file not found at: ${credPath}`);
  }
  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });
}

// ── Deduplication — collect all previously seen business names ─────────────────

async function loadExistingBusinessNames(drive, sheets) {
  const seen = new Set();
  const folderId = process.env.SPREADSHEET_PARENT_FOLDER_ID;

  // Build query: look for HVAC spreadsheets in the configured folder (or anywhere)
  const q = folderId
    ? `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
    : `name contains 'HVAC' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;

  let pageToken;
  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name)',
      pageToken,
    });

    for (const file of res.data.files || []) {
      try {
        const data = await sheets.spreadsheets.values.get({
          spreadsheetId: file.id,
          range: 'B:B', // Business Name column only
        });
        const rows = (data.data.values || []).slice(1); // skip header
        for (const [biz] of rows) {
          if (biz) seen.add(normalizeName(biz));
        }
      } catch {
        // Non-fatal: if we can't read one sheet, skip it
        log('DEDUP', `Could not read sheet "${file.name}" — skipping`);
      }
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  log('DEDUP', `Loaded ${seen.size} existing business names across all sheets`);
  return seen;
}

// ── Google Sheets — create today's spreadsheet ─────────────────────────────────

async function createTodaySpreadsheet(drive, sheets) {
  const title = `SW Michigan HVAC Leads — New ${todayTitleFormatted()}`;
  const folderId = process.env.SPREADSHEET_PARENT_FOLDER_ID;

  const createRes = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      ...(folderId && { parents: [folderId] }),
    },
    fields: 'id, webViewLink',
  });

  const spreadsheetId = createRes.data.id;

  // Write the header row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:I1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        'Date Added', 'Business Name', 'Owner First Name', 'Owner Last Name',
        'Phone Number', 'City', 'Website', 'Called', 'Notes',
      ]],
    },
  });

  log('SHEETS', `Created "${title}" → ${createRes.data.webViewLink}`);
  return { spreadsheetId, title, url: createRes.data.webViewLink };
}

// ── Google Sheets — append leads ───────────────────────────────────────────────

async function appendLeads(sheets, spreadsheetId, leads) {
  if (!leads.length) return;

  const rows = leads.map(l => [
    l.dateAdded,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website,
    '', // Called (blank)
    '', // Notes (blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:I',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  log('SHEETS', `Appended ${leads.length} new lead rows`);
}

// ── Apollo — search for decision-makers at HVAC companies ─────────────────────

async function apolloSearchPeople(page) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in your .env file');

  const res = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    {
      api_key: apiKey,
      person_titles: TARGET_TITLES,
      person_locations: TARGET_CITIES,
      organization_num_employees_ranges: ['1,25'],
      q_organization_keyword_tags: INDUSTRY_TAGS,
      person_seniorities: ['owner', 'c_suite', 'founder'],
      include_similar_titles: true,
      page,
      per_page: 50,
    },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
  );

  return res.data.people || [];
}

// ── Apollo — enrich a person to get their direct phone number ──────────────────
// Each enrichment call costs 1 Apollo export credit. Skips if no phone found.

async function getPhoneNumber(personId, firstName, lastName, orgName) {
  const apiKey = process.env.APOLLO_API_KEY;

  try {
    const res = await axios.post(
      `${APOLLO_BASE_URL}/people/match`,
      {
        api_key: apiKey,
        id: personId,
        first_name: firstName,
        last_name: lastName,
        organization_name: orgName,
        reveal_personal_emails: false,
        reveal_phone_number: true,
      },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );

    const p = res.data.person || {};
    // Prefer sanitized_phone; fall back to first phone number in array
    return p.sanitized_phone
      || p.phone_numbers?.[0]?.sanitized_number
      || null;
  } catch {
    return null;
  }
}

// ── Main workflow ─────────────────────────────────────────────────────────────

async function runWorkflow() {
  log('RUN', `Starting HVAC lead generation — max ${MAX_LEADS_PER_RUN} leads`);

  try {
    // 1. Set up Google APIs
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // 2. Load all previously seen business names to prevent duplicates
    const existingNames = await loadExistingBusinessNames(drive, sheets);

    // 3. Create today's spreadsheet with the header row
    const { spreadsheetId, title, url } = await createTodaySpreadsheet(drive, sheets);

    // 4. Search Apollo and collect new leads
    const newLeads = [];
    let apolloPage = 1;
    let totalChecked = 0;

    outer:
    while (newLeads.length < MAX_LEADS_PER_RUN && apolloPage <= 10) {
      let people;
      try {
        people = await apolloSearchPeople(apolloPage);
      } catch (err) {
        const detail = err.response?.data?.error || err.message;
        throw new Error(`Apollo search failed (page ${apolloPage}): ${detail}`);
      }

      if (!people.length) {
        log('APOLLO', 'No more results from Apollo');
        break;
      }

      for (const person of people) {
        if (newLeads.length >= MAX_LEADS_PER_RUN) break outer;
        totalChecked++;

        const bizName = person.organization?.name || '';
        if (!bizName) continue;

        // Skip if already in any previous sheet
        if (existingNames.has(normalizeName(bizName))) {
          log('DEDUP', `Skip (duplicate): ${bizName}`);
          continue;
        }

        // Enrich to get phone number — skip contacts with no phone
        const phone = await getPhoneNumber(
          person.id,
          person.first_name,
          person.last_name,
          bizName
        );

        if (!phone) {
          log('SKIP', `No phone number: ${person.first_name} ${person.last_name} @ ${bizName}`);
          continue;
        }

        const lead = {
          dateAdded: todayFormatted(),
          businessName: bizName,
          firstName: person.first_name || '',
          lastName: person.last_name || '',
          phone,
          city: person.city || person.organization?.city || '',
          website: person.organization?.website_url || person.organization?.primary_domain || '',
        };

        // Mark as seen within this run to avoid intra-run duplicates
        existingNames.add(normalizeName(bizName));
        newLeads.push(lead);

        log('LEAD', `✓ ${lead.businessName} | ${lead.firstName} ${lead.lastName} | ${lead.phone} | ${lead.city}`);
      }

      apolloPage++;
    }

    log('RUN', `Checked ${totalChecked} Apollo records → found ${newLeads.length} new leads`);

    // 5. Write leads to the spreadsheet
    if (newLeads.length > 0) {
      await appendLeads(sheets, spreadsheetId, newLeads);
      log('DONE', `${newLeads.length} leads written to "${title}"`);
      log('DONE', `Spreadsheet URL: ${url}`);
    } else {
      log('WARN', 'No new leads found this run — spreadsheet was created but left empty');
      await sendErrorEmail(
        'No new leads found',
        `The workflow ran at ${new Date().toISOString()} but found 0 qualifying leads ` +
        `after checking ${totalChecked} Apollo records.\n\n` +
        `Spreadsheet "${title}" was created but contains only the header row.\n\n` +
        `Possible reasons:\n` +
        `  • All matching contacts are already in previous sheets\n` +
        `  • Apollo returned no results for the current filters\n` +
        `  • All contacts lack a phone number\n\n` +
        `Consider expanding TARGET_CITIES or INDUSTRY_TAGS in index.js.`
      );
    }

  } catch (err) {
    const errMsg = err.message;
    log('ERROR', errMsg);
    await sendErrorEmail('Workflow error', errMsg);
  }
}

// ── Connection test mode ───────────────────────────────────────────────────────
// Run: node index.js --test
// Verifies Apollo API key and Google Drive credentials before the first live run.

async function runConnectionTest() {
  console.log('\n════════════════════════════════════════');
  console.log('  HVAC Lead Bot — Connection Test Mode  ');
  console.log('════════════════════════════════════════\n');

  let allGood = true;

  // Test Apollo
  process.stdout.write('Testing Apollo.io API key... ');
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey || apiKey === 'your_apollo_api_key_here') {
      throw new Error('APOLLO_API_KEY is missing or still set to the placeholder value');
    }
    // Lightweight call: fetch current user profile
    await axios.get(`${APOLLO_BASE_URL}/users/profile`, {
      params: { api_key: apiKey },
    });
    console.log('✓  Connected');
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    console.log(`✗  FAILED: ${detail}`);
    allGood = false;
  }

  // Test Google Drive
  process.stdout.write('Testing Google Drive credentials... ');
  try {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const about = await drive.about.get({ fields: 'user' });
    console.log(`✓  Connected as ${about.data.user?.emailAddress}`);
  } catch (err) {
    console.log(`✗  FAILED: ${err.message}`);
    allGood = false;
  }

  // Test Google Sheets write permission (dry-run folder listing)
  process.stdout.write('Testing Google Sheets access... ');
  try {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.SPREADSHEET_PARENT_FOLDER_ID;
    const q = folderId
      ? `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet'`
      : `mimeType = 'application/vnd.google-apps.spreadsheet'`;
    const res = await drive.files.list({ q, pageSize: 1, fields: 'files(id)' });
    console.log(`✓  Can list spreadsheets (found ${res.data.files?.length || 0} in test query)`);
  } catch (err) {
    console.log(`✗  FAILED: ${err.message}`);
    allGood = false;
  }

  console.log('\n' + (allGood
    ? '✅  All systems connected — safe to start the scheduler (npm start)'
    : '❌  One or more connections failed — fix the errors above before starting'));
  console.log('');
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (process.argv.includes('--test')) {
  runConnectionTest();
} else {
  // Schedule for 7:00 AM Eastern Time every day
  const CRON_SCHEDULE = '0 7 * * *';

  cron.schedule(CRON_SCHEDULE, runWorkflow, {
    timezone: 'America/New_York',
    runOnInit: false,
  });

  log('SCHEDULER', `Workflow scheduled for 7:00 AM Eastern daily (cron: "${CRON_SCHEDULE}")`);
  log('SCHEDULER', 'Running once now to verify the workflow works end-to-end...\n');

  // Run immediately on startup so you can confirm it works
  runWorkflow().then(() => {
    log('SCHEDULER', 'Initial run complete. Waiting for the 7 AM schedule...');
  });
}
