'use strict';

/**
 * index.js — Apollo.io → Google Sheets lead generation workflow
 *
 * Run modes:
 *   node index.js             → start the daily 7am scheduler (keep process running)
 *   node index.js --run-now   → execute once immediately (good for testing)
 *
 * Edit config.js to change cities, industries, titles, or column layout.
 * Edit .env to change API keys and spreadsheet ID.
 */

require('dotenv').config();

const cron       = require('node-cron');
const axios      = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const config     = require('./config');

// ─── Logging ─────────────────────────────────────────────────────────────────

const LOG_FILE = path.join(__dirname, 'run.log');

function log(message, level = 'INFO') {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

function logError(message, err) {
  log(`${message}: ${err?.message || String(err)}`, 'ERROR');
  if (err?.stack) {
    try { fs.appendFileSync(LOG_FILE, err.stack + '\n'); } catch (_) {}
  }
}

// ─── Email Alerts ─────────────────────────────────────────────────────────────

async function sendErrorAlert(subject, body) {
  const to       = process.env.ALERT_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!to || !smtpUser || !smtpPass) {
    log('Email alert skipped (ALERT_EMAIL / SMTP_USER / SMTP_PASS not configured).', 'WARN');
    log(`Undelivered alert — ${subject}: ${body.split('\n')[0]}`, 'WARN');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth:   { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from:    smtpUser,
      to,
      subject: `[Lead Gen] ${subject}`,
      text:    body,
    });

    log(`Alert email sent to ${to}: "${subject}"`);
  } catch (err) {
    logError('Failed to send alert email', err);
  }
}

// ─── Apollo.io API ───────────────────────────────────────────────────────────

/**
 * Calls Apollo's people search endpoint for one page of results.
 * Apollo v1 API: api_key goes in the request body.
 */
async function fetchApolloPage(page) {
  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      api_key:                         process.env.APOLLO_API_KEY,
      page,
      per_page:                        100,
      person_titles:                   config.targetTitles,
      organization_num_employees_ranges: config.employeeRanges,
      organization_locations:          config.apolloLocations,
      organization_sic_codes:          config.apolloSicCodes,
      q_organization_keyword_tags:     config.industryKeywords,
      include_similar_titles:          true,
    },
    {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30_000,
    }
  );

  return response.data;
}

/**
 * Returns true if the city string matches one of our target cities.
 * Case-insensitive, handles "St. Joseph" vs "Saint Joseph" via both alias forms in config.
 */
function isTargetCity(cityRaw) {
  if (!cityRaw) return false;
  const city = cityRaw.toLowerCase().trim();
  return config.targetCities.some(t => {
    const target = t.toLowerCase();
    return city === target || city.startsWith(target) || target.startsWith(city);
  });
}

/**
 * Pulls the best available phone number from a person record.
 * Priority: mobile → direct → any available → org primary phone.
 */
function extractPhone(person) {
  const phones = Array.isArray(person.phone_numbers) ? person.phone_numbers : [];

  for (const preferred of ['mobile', 'direct', 'work_hq', null]) {
    const hit = phones.find(p => p.type === preferred && p.sanitized_number);
    if (hit) return hit.sanitized_number;
  }

  // Last resort: grab first phone of any type
  const any = phones.find(p => p.sanitized_number);
  if (any) return any.sanitized_number;

  // Organization-level fallback
  return person.organization?.primary_phone?.sanitized_number || null;
}

/**
 * Converts a raw Apollo person object into the lead shape we store.
 */
function buildLead(person) {
  const org   = person.organization || {};
  const phone = extractPhone(person);
  const city  = person.city || org.city || '';

  return {
    dateAdded:    new Date().toLocaleDateString('en-US'),   // MM/DD/YYYY
    businessName: person.organization_name || org.name || '',
    firstName:    person.first_name  || '',
    lastName:     person.last_name   || '',
    phone,
    city,
    website:      org.website_url || '',
    called:       '',   // left blank for the user
    notes:        '',   // left blank for the user
  };
}

/**
 * Searches Apollo across multiple pages and returns up to `limit` leads that:
 *   – are in a Southwest Michigan target city
 *   – have a phone number
 *   – have a business name
 */
async function collectLeadsFromApollo(limit) {
  const results = [];
  log(`Querying Apollo (max ${config.maxPagesToScan} pages, looking for ${limit} qualified leads)...`);

  for (let page = 1; page <= config.maxPagesToScan; page++) {
    if (results.length >= limit) break;

    log(`  Apollo page ${page}...`);
    let data;

    try {
      data = await fetchApolloPage(page);
    } catch (err) {
      // Surface the HTTP status if available for easier debugging
      const status = err.response?.status;
      throw new Error(
        `Apollo API error on page ${page}${status ? ` (HTTP ${status})` : ''}: ${err.message}`
      );
    }

    const people = data.people || [];
    const total  = data.pagination?.total_entries ?? '?';

    if (page === 1) log(`  Apollo reports ~${total} total matching records.`);
    if (people.length === 0) { log('  No more results.'); break; }

    for (const person of people) {
      if (results.length >= limit) break;

      const lead = buildLead(person);

      if (!lead.businessName)          continue;  // skip nameless records
      if (!isTargetCity(lead.city))    continue;  // skip out-of-area
      if (!lead.phone)                 continue;  // skip records with no phone

      results.push(lead);
    }

    log(`  Qualified so far: ${results.length}/${limit}`);

    // Polite pause between pages to stay within Apollo's rate limits
    if (page < config.maxPagesToScan && results.length < limit) {
      await sleep(600);
    }
  }

  return results;
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

function buildGoogleAuth() {
  // Prefer JSON file; fall back to inline JSON string
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    return new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
      scopes:  ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes:      ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  throw new Error(
    'No Google credentials configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or ' +
    'GOOGLE_CREDENTIALS_JSON in your .env file.'
  );
}

/**
 * Returns a lowercase Set of business names already present in column B.
 * Used to deduplicate before writing.
 */
async function readExistingBusinessNames() {
  const auth   = buildGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const range  = `${config.sheetTabName}!B:B`;

  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  // rows[0] is the header "Business Name" — skip it
  return new Set(
    rows.slice(1)
      .map(r => (r[0] || '').toString().toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Appends an array of lead objects to the sheet as new rows.
 */
async function appendToSheet(leads) {
  const auth   = buildGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const rows = leads.map(lead => [
    lead.dateAdded,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    lead.called,
    lead.notes,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId:   process.env.GOOGLE_SPREADSHEET_ID,
    range:           `${config.sheetTabName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:     { values: rows },
  });
}

// ─── Main Workflow ────────────────────────────────────────────────────────────

async function runWorkflow() {
  log('══════════════════════════════════════════════');
  log('Lead generation run starting...');

  // ── Step 1: Fetch from Apollo ───────────────────────────────────────────
  let rawLeads;
  try {
    // Overfetch by 4× so we have room to absorb duplicates and still hit the target
    rawLeads = await collectLeadsFromApollo(config.maxLeadsPerRun * 4);
  } catch (err) {
    logError('Apollo search failed', err);
    await sendErrorAlert(
      'Apollo API Error',
      `Lead generation failed while searching Apollo.io.\n\nError: ${err.message}\n\n` +
      `Check run.log for details.\nCommon causes:\n` +
      `  • Invalid or expired APOLLO_API_KEY\n` +
      `  • Apollo rate limit hit (wait a few minutes)\n` +
      `  • No internet connectivity`
    );
    return;
  }

  if (rawLeads.length === 0) {
    log('Apollo returned 0 qualified leads matching the current filters.', 'WARN');
    await sendErrorAlert(
      'No Leads Found',
      `Apollo returned 0 qualified leads for Southwest Michigan HVAC this run.\n\n` +
      `Things to try:\n` +
      `  • Add more cities to targetCities in config.js\n` +
      `  • Add more industry keywords to industryKeywords\n` +
      `  • Expand employeeRanges (e.g. add "26,50")\n` +
      `  • Check that APOLLO_API_KEY has search access`
    );
    return;
  }

  log(`Apollo returned ${rawLeads.length} qualified candidate leads.`);

  // ── Step 2: Read existing sheet data ───────────────────────────────────
  let existingNames;
  try {
    existingNames = await readExistingBusinessNames();
    log(`Sheet has ${existingNames.size} existing businesses (deduplication check).`);
  } catch (err) {
    logError('Failed to read existing sheet data', err);
    await sendErrorAlert(
      'Google Sheets Read Error',
      `Could not read existing leads from Google Sheets (needed for duplicate check).\n\n` +
      `Error: ${err.message}\n\n` +
      `Common causes:\n` +
      `  • Wrong GOOGLE_SPREADSHEET_ID in .env\n` +
      `  • Service account not shared with the spreadsheet (see setup guide)\n` +
      `  • Invalid google-credentials.json`
    );
    return;
  }

  // ── Step 3: Deduplicate ─────────────────────────────────────────────────
  const newLeads = rawLeads.filter(
    lead => !existingNames.has(lead.businessName.toLowerCase().trim())
  );

  const dupeCount = rawLeads.length - newLeads.length;
  log(`Deduplication: ${dupeCount} already in sheet, ${newLeads.length} new.`);

  if (newLeads.length === 0) {
    log('All candidate leads are already in the sheet — nothing to add today.');
    return;
  }

  // ── Step 4: Trim to daily limit ─────────────────────────────────────────
  const leadsToAdd = newLeads.slice(0, config.maxLeadsPerRun);
  log(`Writing ${leadsToAdd.length} new leads to Google Sheets...`);

  // ── Step 5: Write to sheet ──────────────────────────────────────────────
  try {
    await appendToSheet(leadsToAdd);
  } catch (err) {
    logError('Failed to write to Google Sheets', err);
    await sendErrorAlert(
      'Google Sheets Write Error',
      `Found ${leadsToAdd.length} new leads but failed to write them to the sheet.\n\n` +
      `Error: ${err.message}\n\n` +
      `Common causes:\n` +
      `  • Service account doesn't have Editor access to the spreadsheet\n` +
      `  • Sheet tab name doesn't match config.sheetTabName ("${config.sheetTabName}")\n` +
      `  • Google Sheets API quota exceeded`
    );
    return;
  }

  log(`Done. Added ${leadsToAdd.length} new leads.`);
  log('══════════════════════════════════════════════');
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

function startScheduler() {
  log(`Scheduler active: "${config.cronSchedule}" (${config.cronTimezone})`);
  log('Process will stay running until stopped (Ctrl+C or kill signal).');

  cron.schedule(
    config.cronSchedule,
    () => {
      log('Cron fired — starting workflow run.');
      runWorkflow().catch(err => logError('Unhandled workflow error', err));
    },
    { timezone: config.cronTimezone }
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const missing  = required.filter(k => !process.env[k]);

  if (missing.length) {
    console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example → .env and fill in the values, then retry.\n');
    process.exit(1);
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE && !process.env.GOOGLE_CREDENTIALS_JSON) {
    console.error('\nNo Google credentials configured.');
    console.error('Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_CREDENTIALS_JSON in .env\n');
    process.exit(1);
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

validateEnv();

const args = process.argv.slice(2);

if (args.includes('--run-now')) {
  log('--run-now flag detected: executing immediately.');
  runWorkflow()
    .then(() => process.exit(0))
    .catch(err => { logError('Fatal error', err); process.exit(1); });
} else {
  startScheduler();
}
