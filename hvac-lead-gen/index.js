/**
 * HVAC Lead Generation Workflow
 *
 * Searches Apollo.io for HVAC/plumbing/mechanical owners in Southwest Michigan,
 * deduplicates against your Google Sheet, and appends up to 25 fresh leads.
 * Scheduled daily at 7 AM Eastern via node-cron.
 *
 * First-time setup: run  `node setup.js`  before starting this scheduler.
 * Immediate test:        `npm run test-run`  (RUN_NOW=true node index.js)
 * Edit search targets:   config.js
 */

require('dotenv').config();

const axios      = require('axios');
const { google } = require('googleapis');
const cron       = require('node-cron');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const config     = require('./config');

// ── Environment ──────────────────────────────────────────────────────────────

const APOLLO_API_KEY  = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID  = process.env.SPREADSHEET_ID;
const SHEET_TAB       = process.env.SHEET_TAB  || 'Sheet1';
const CRON_SCHEDULE   = process.env.CRON_SCHEDULE || '0 7 * * *'; // 7 AM ET every day

// Optional email alerts on error
const NOTIFY_EMAIL    = process.env.NOTIFY_EMAIL;
const SMTP_HOST       = process.env.SMTP_HOST;
const SMTP_PORT       = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER       = process.env.SMTP_USER;
const SMTP_PASS       = process.env.SMTP_PASS;

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'google-oauth.json');
const TOKEN_PATH       = path.join(__dirname, 'credentials', 'token.json');

// ── Google Auth ───────────────────────────────────────────────────────────────

function getGoogleAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Google credentials not found at ${CREDENTIALS_PATH}.\n` +
      `Run 'node setup.js' to complete authorization.`
    );
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      `Google token not found at ${TOKEN_PATH}.\n` +
      `Run 'node setup.js' to authorize your Google account.`
    );
  }

  const creds   = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed ?? creds.web;
  const oauth2  = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oauth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  return oauth2;
}

// ── Apollo Search ─────────────────────────────────────────────────────────────

async function fetchApolloLeads() {
  if (!APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  // Fetch a buffer 3× larger than our limit so deduplication still yields enough leads
  const fetchSize = Math.min(config.maxLeadsPerRun * 3, 100);

  const payload = {
    person_titles:                     config.jobTitles,
    include_similar_titles:            false,   // strict title match
    person_locations:                  config.targetCities,
    organization_locations:            ['Michigan, United States'],
    organization_num_employees_ranges: [config.employeeRange],
    q_organization_keyword_tags:       config.industryKeywords,
    per_page:                          fetchSize,
    page:                              1,
  };

  console.log('[Apollo] Sending search request…');

  let response;
  try {
    response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      payload,
      {
        headers: {
          'x-api-key':     APOLLO_API_KEY,
          'Content-Type':  'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 25_000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error ?? err.message;
    throw new Error(`Apollo API error (HTTP ${status ?? 'network'}): ${detail}`);
  }

  const people = response.data?.people ?? [];
  const total  = response.data?.pagination?.total_entries ?? '?';
  console.log(`[Apollo] ${people.length} results returned (${total} total available in Apollo)`);

  // Map to our row shape; skip anyone without a phone number
  const leads = [];
  for (const person of people) {
    const phone = pickBestPhone(person);
    if (!phone) continue;                          // required — skip if no phone

    const org = person.organization ?? {};
    leads.push({
      dateAdded:    new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
      businessName: (org.name               ?? '').trim(),
      firstName:    (person.first_name      ?? '').trim(),
      lastName:     (person.last_name       ?? '').trim(),
      phone,
      city:         pickCity(person),
      website:      (org.website_url        ?? '').trim(),
      called:       '',
      notes:        '',
    });
  }

  console.log(`[Apollo] ${leads.length} of ${people.length} results have a phone number`);

  if (leads.length === 0 && people.length > 0) {
    console.log(
      '[Apollo] NOTE: Apollo returned contacts but none had phone numbers exposed.\n' +
      '         Phone numbers require a Basic plan ($49/mo) or higher in Apollo.\n' +
      '         On the free tier you will see 0 phone results. Upgrade at apollo.io.'
    );
  }

  return leads;
}

/**
 * Return the best available phone number for a person, in priority order:
 *   direct → mobile → corporate → other → first available
 */
function pickBestPhone(person) {
  const numbers  = person.phone_numbers ?? [];
  const priority = ['direct_phone', 'mobile_phone', 'corporate_phone', 'other_phone'];

  for (const type of priority) {
    const match = numbers.find(n => n.type === type);
    if (match?.sanitized_number) return match.sanitized_number;
    if (match?.raw_number)       return match.raw_number;
  }

  if (numbers.length > 0) {
    return numbers[0].sanitized_number ?? numbers[0].raw_number ?? null;
  }
  return null;
}

/** Extract city from the person's location or their organization's address. */
function pickCity(person) {
  if (person.city) return person.city;

  const addr = person.organization?.raw_address ?? '';
  if (addr) {
    // e.g. "123 Main St, Kalamazoo, MI 49001" → "Kalamazoo"
    const parts = addr.split(',');
    if (parts.length >= 2) return parts[parts.length - 2].trim();
  }
  return '';
}

// ── Google Sheets ─────────────────────────────────────────────────────────────

/** Read column B (Business Name) and return a lowercase Set of existing names. */
async function getExistingBusinessNames(sheets) {
  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range:         `${SHEET_TAB}!B:B`,
  });

  const rows  = res.data.values ?? [];
  const names = new Set(
    rows.slice(1)                               // skip header row
        .map(r => (r[0] ?? '').toLowerCase().trim())
        .filter(Boolean)
  );

  console.log(`[Sheets] ${names.size} existing business name(s) found in sheet`);
  return names;
}

/** Append lead rows to the sheet. Returns the number of rows appended. */
async function appendLeads(sheets, leads) {
  if (leads.length === 0) {
    console.log('[Sheets] Nothing new to append');
    return 0;
  }

  const rows = leads.map(l => [
    l.dateAdded,
    l.businessName,
    l.firstName,
    l.lastName,
    l.phone,
    l.city,
    l.website,
    l.called,
    l.notes,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId:    SPREADSHEET_ID,
    range:            `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: rows },
  });

  console.log(`[Sheets] Appended ${leads.length} new row(s)`);
  return leads.length;
}

// ── Error Notifications ───────────────────────────────────────────────────────

async function notify(subject, body) {
  const fullSubject = `[HVAC Lead Gen] ${subject}`;
  console.error(`\n⚠  ${fullSubject}`);
  console.error(`   ${body}\n`);

  if (!SMTP_HOST || !NOTIFY_EMAIL) {
    console.log('   (SMTP not configured — email alert skipped; see .env for setup)');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from:    SMTP_USER,
      to:      NOTIFY_EMAIL,
      subject: fullSubject,
      text:    `${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });

    console.log(`   Email alert sent → ${NOTIFY_EMAIL}`);
  } catch (mailErr) {
    console.error(`   Could not send email alert: ${mailErr.message}`);
  }
}

// ── Main Workflow ─────────────────────────────────────────────────────────────

async function runWorkflow() {
  const start = Date.now();
  const ts    = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(` HVAC Lead Gen run started — ${ts} ET`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // 1. Pull leads from Apollo
    const allLeads = await fetchApolloLeads();

    if (allLeads.length === 0) {
      await notify(
        'No results from Apollo',
        'Apollo returned 0 contacts with phone numbers.\n' +
        'Possible causes: API key invalid, plan lacks phone access, or no matches for current filters.\n' +
        'Check your APOLLO_API_KEY and plan at https://apollo.io'
      );
      return;
    }

    // 2. Connect to Google Sheets
    const auth   = getGoogleAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // 3. Deduplicate against existing sheet entries
    const existingNames = await getExistingBusinessNames(sheets);
    const freshLeads    = allLeads.filter(l => {
      const key = l.businessName.toLowerCase().trim();
      return key.length > 0 && !existingNames.has(key);
    });

    const dupCount = allLeads.length - freshLeads.length;
    console.log(
      `[Dedup] ${dupCount} duplicate(s) removed — ` +
      `${freshLeads.length} fresh lead(s) remain`
    );

    // 4. Cap at the configured per-run limit
    const toWrite = freshLeads.slice(0, config.maxLeadsPerRun);

    // 5. Write to sheet
    const added   = await appendLeads(sheets, toWrite);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\n✓ Run complete — ${added} lead(s) added in ${elapsed}s`);

    if (freshLeads.length > config.maxLeadsPerRun) {
      const skipped = freshLeads.length - config.maxLeadsPerRun;
      console.log(
        `  ${skipped} additional lead(s) skipped to stay under the ` +
        `${config.maxLeadsPerRun}-lead daily cap.`
      );
    }

  } catch (err) {
    await notify('Workflow error', err.message);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

console.log('\nHVAC Lead Gen scheduler starting…');
console.log(`  Schedule : "${CRON_SCHEDULE}" in America/New_York timezone`);
console.log(`  Sheet    : ${SPREADSHEET_ID ?? '(not set — check .env)'}`);
console.log(`  Now      : ${new Date().toISOString()}`);
console.log('\nFirst time? Run:  node setup.js\n');

cron.schedule(CRON_SCHEDULE, runWorkflow, { timezone: 'America/New_York' });

// Run immediately when RUN_NOW=true (used by `npm run test-run`)
if (process.env.RUN_NOW === 'true') {
  console.log('RUN_NOW=true detected — executing workflow immediately…\n');
  runWorkflow();
}
