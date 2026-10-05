// ─── Core Workflow: Apollo Search → Dedupe → Google Sheets Append ─────────────
// This module does the real work. Called by the cron scheduler (index.js)
// and by run-now.js for one-off manual runs.

require('dotenv').config();

const axios       = require('axios');
const { google }  = require('googleapis');
const fs          = require('fs');
const path        = require('path');
const readline    = require('readline');
const nodemailer  = require('nodemailer');
const config      = require('./config');

// ─── Environment Variables ────────────────────────────────────────────────────
const APOLLO_API_KEY     = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID     = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME         = process.env.SHEET_NAME || 'Sheet1';
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;
const SMTP_USER          = process.env.SMTP_USER;
const SMTP_PASS          = process.env.SMTP_PASS;

// Paths for Google OAuth token storage
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH       = path.join(__dirname, 'token.json');

// Google Sheets scopes needed
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns an authenticated Google Sheets client.
 * On first run, prompts the user to authorize in their browser.
 * Saves the token to token.json so subsequent runs are silent.
 */
async function getGoogleAuth() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials.json not found.\n' +
      'Download it from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.\n' +
      'Save it as hvac-lead-gen/credentials.json'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Reuse saved token if it exists
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
  }

  // First-time: prompt user to open auth URL in browser
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n─── Google Authorization Required ───────────────────────────────────────');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter authorizing, paste the code shown here:');

  const code = await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Authorization code: ', (answer) => { rl.close(); resolve(answer.trim()); });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log('✓ Token saved to token.json\n');
  return oAuth2Client;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns all values in column B (Business Name) from the sheet,
 * lowercased and trimmed, for duplicate detection.
 */
async function getExistingBusinessNames(sheets) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range:         `${SHEET_NAME}!B2:B`,  // column B = Business Name; skip header row
  });
  const rows = response.data.values || [];
  return new Set(rows.flat().map((name) => name.trim().toLowerCase()));
}

/**
 * Appends an array of lead rows to the bottom of the sheet.
 * Each row must be in the same column order as config.sheetColumns.
 */
async function appendLeads(sheets, rows) {
  await sheets.spreadsheets.values.append({
    spreadsheetId:     SPREADSHEET_ID,
    range:             `${SHEET_NAME}!A:I`,
    valueInputOption:  'USER_ENTERED',
    insertDataOption:  'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// APOLLO.IO SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Searches Apollo.io for HVAC decision-makers across all target cities.
 * Returns up to config.maxLeadsPerRun contacts that have a phone number.
 */
async function searchApolloLeads() {
  const url = 'https://api.apollo.io/api/v1/mixed_people/search';

  const payload = {
    api_key:                          APOLLO_API_KEY,
    q_keywords:                       config.industryKeywords,
    person_titles:                    config.targetTitles,
    person_locations:                 config.targetCities,
    organization_num_employees_ranges: config.employeeRanges,
    contact_email_status:             ['verified', 'unverified', 'likely to engage', 'unavailable'],
    page:                             1,
    per_page:                         Math.min(config.maxLeadsPerRun * 2, 50), // fetch extras so we have headroom after phone filter
  };

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const people = response.data.people || [];

  // Filter: keep only contacts that have at least one phone number
  const withPhone = people.filter(
    (p) => Array.isArray(p.phone_numbers) && p.phone_numbers.length > 0
  );

  return withPhone.slice(0, config.maxLeadsPerRun);
}

/**
 * Extracts the best available phone number from Apollo's phone_numbers array.
 * Prefers: mobile → direct → work → any.
 */
function pickBestPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return '';
  const priority = ['mobile', 'direct_phone', 'work_hq', 'work'];
  for (const type of priority) {
    const match = phoneNumbers.find((p) => p.type === type);
    if (match) return match.sanitized_number || match.raw_number || '';
  }
  // Fall back to first available number
  return phoneNumbers[0].sanitized_number || phoneNumbers[0].raw_number || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sends an error notification email and always logs to console.
 * Will not throw — notification failure should never crash the workflow.
 */
async function sendErrorNotification(subject, errorMessage) {
  console.error(`\n[ERROR] ${subject}\n${errorMessage}\n`);

  if (!NOTIFICATION_EMAIL || !SMTP_USER || !SMTP_PASS) {
    console.warn('[WARN] Email notification skipped — NOTIFICATION_EMAIL / SMTP_USER / SMTP_PASS not set in .env');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from:    `"HVAC Lead Gen" <${SMTP_USER}>`,
      to:      NOTIFICATION_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text:    `${errorMessage}\n\nTime: ${new Date().toISOString()}\nAction required: check the workflow logs.`,
    });

    console.log(`[INFO] Error notification sent to ${NOTIFICATION_EMAIL}`);
  } catch (mailErr) {
    console.error('[ERROR] Failed to send notification email:', mailErr.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WORKFLOW FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function runWorkflow() {
  const runStart = new Date();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`HVAC Lead Gen — Run started at ${runStart.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── 1. Validate environment variables ──────────────────────────────────────
  if (!APOLLO_API_KEY) {
    await sendErrorNotification('Missing config', 'APOLLO_API_KEY is not set in .env');
    return;
  }
  if (!SPREADSHEET_ID) {
    await sendErrorNotification('Missing config', 'GOOGLE_SPREADSHEET_ID is not set in .env');
    return;
  }

  // ── 2. Authenticate with Google ────────────────────────────────────────────
  let auth;
  try {
    auth = await getGoogleAuth();
  } catch (err) {
    await sendErrorNotification('Google Auth Failed', err.message);
    return;
  }

  const sheets = google.sheets({ version: 'v4', auth });

  // ── 3. Read existing business names for deduplication ─────────────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`[INFO] Found ${existingNames.size} existing businesses in sheet (for deduplication)`);
  } catch (err) {
    await sendErrorNotification('Google Sheets Read Failed', err.message);
    return;
  }

  // ── 4. Search Apollo for leads ─────────────────────────────────────────────
  let rawLeads;
  try {
    rawLeads = await searchApolloLeads();
    console.log(`[INFO] Apollo returned ${rawLeads.length} contacts with phone numbers`);
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    await sendErrorNotification('Apollo Search Failed', detail);
    return;
  }

  if (rawLeads.length === 0) {
    await sendErrorNotification(
      'Apollo Returned No Results',
      'Apollo search returned zero contacts matching your filters for Southwest Michigan HVAC companies.\n' +
      'You may have exhausted the available contacts for these cities. Consider expanding the city list in config.js.'
    );
    return;
  }

  // ── 5. Deduplicate against existing sheet rows ─────────────────────────────
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }); // MM/DD/YYYY

  const newRows = [];

  for (const person of rawLeads) {
    const businessName = (person.organization_name || '').trim();
    if (!businessName) continue;

    // Skip if already in sheet
    if (existingNames.has(businessName.toLowerCase())) {
      console.log(`[SKIP] Duplicate: ${businessName}`);
      continue;
    }

    const phone   = pickBestPhone(person.phone_numbers);
    const city    = person.city || '';
    const website = person.organization_website_url || '';

    newRows.push([
      today,                            // Date Added
      businessName,                     // Business Name
      person.first_name || '',          // Owner First Name
      person.last_name  || '',          // Owner Last Name
      phone,                            // Phone Number
      city,                             // City
      website,                          // Website
      '',                               // Called (blank — fill manually)
      '',                               // Notes (blank — fill manually)
    ]);

    // Mark as seen to prevent intra-run dupes when Apollo returns the same company via multiple contacts
    existingNames.add(businessName.toLowerCase());
  }

  console.log(`[INFO] ${newRows.length} new (non-duplicate) leads to add`);

  if (newRows.length === 0) {
    console.log('[INFO] All Apollo results were already in the sheet — nothing to add. Run complete.');
    return;
  }

  // ── 6. Append new leads to Google Sheets ──────────────────────────────────
  try {
    await appendLeads(sheets, newRows);
    console.log(`\n✓ Successfully added ${newRows.length} leads to "${SHEET_NAME}"`);
  } catch (err) {
    await sendErrorNotification('Google Sheets Write Failed', err.message);
    return;
  }

  // ── 7. Summary ─────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - runStart.getTime()) / 1000).toFixed(1);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Run complete in ${elapsed}s — ${newRows.length} new leads added`);
  console.log(`${'─'.repeat(60)}\n`);
}

module.exports = { runWorkflow, getGoogleAuth };
