'use strict';

// ============================================================
// HVAC Lead Generation — Apollo.io → Google Sheets
// Runs daily at 7:00 AM Eastern Time via node-cron
//
// Usage:
//   node lead-generation.js             — verify connections, then start scheduler
//   node lead-generation.js --run-now   — pull leads immediately (test mode)
//   node lead-generation.js --verify    — check connections only, then exit
// ============================================================

require('dotenv').config();

const cron       = require('node-cron');
const axios      = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');

// ============================================================
// CONFIGURATION — modify city list, titles, or limits here
// ============================================================

const CONFIG = {
  // Target Google Spreadsheet
  // To use a different sheet: update SPREADSHEET_ID in .env
  spreadsheetId: process.env.SPREADSHEET_ID || '15DJVZJiMnbt6tdF6e2RMcGY6_M1JrjxomiIJJPJykhU',
  sheetTab: 'Sheet1',

  // Max new leads to add per daily run
  maxLeadsPerRun: 25,

  // Southwest Michigan cities — add/remove cities freely
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Industries to search in Apollo
  industries: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // Target job titles — searched in this priority order
  targetTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Company size: 1–25 employees (owner-operated small businesses)
  employeeRanges: ['1,10', '11,25'],

  // Notification email for error alerts
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',

  // Path for stored Google OAuth token (created by setup-google-auth.js)
  tokenPath: path.join(__dirname, 'google-token.json'),

  // Cron: 7:00 AM Eastern Time, every day
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',
};

// ============================================================
// APOLLO API
// ============================================================

/**
 * Search Apollo for HVAC owners/decision-makers in SW Michigan.
 * Returns leads that have a phone number.
 *
 * NOTE: Requires Apollo Basic plan or higher.
 *       Free plan returns API_INACCESSIBLE for this endpoint.
 */
async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  // Pull 100 results per page so we have enough to filter down to 25 with phones
  const payload = {
    api_key: apiKey,
    person_titles: CONFIG.targetTitles,
    person_locations: CONFIG.targetCities,
    q_organization_keyword_tags: CONFIG.industries,
    organization_num_employees_ranges: CONFIG.employeeRanges,
    include_similar_titles: true,
    per_page: 100,
    page: 1,
  };

  console.log('[Apollo] Searching for HVAC decision-makers in Southwest Michigan...');

  let response;
  try {
    response = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
  } catch (err) {
    const data = err.response?.data;
    if (data?.error_code === 'API_INACCESSIBLE') {
      throw new Error(
        'Your Apollo plan does not include API access. ' +
        'Upgrade at https://www.apollo.io/pricing (Basic plan or higher required).'
      );
    }
    throw new Error(`Apollo API error: ${data?.message || err.message}`);
  }

  const people = response.data?.people || [];
  console.log(`[Apollo] Raw results: ${people.length}`);

  // Keep only results that have at least one phone number
  const withPhones = people.filter(p => {
    const phones = p.phone_numbers || [];
    const hasSanitized = Boolean(p.sanitized_phone);
    const hasPhoneNumber = phones.some(ph => ph.sanitized_number || ph.raw_number);
    return hasSanitized || hasPhoneNumber;
  });

  console.log(`[Apollo] Results with phone numbers: ${withPhones.length}`);

  // Map each Apollo person to our spreadsheet schema
  return withPhones.map(p => {
    const phone =
      p.phone_numbers?.[0]?.sanitized_number ||
      p.sanitized_phone ||
      p.phone_numbers?.[0]?.raw_number ||
      '';

    const website =
      p.organization?.website_url ||
      (p.organization?.primary_domain
        ? `https://${p.organization.primary_domain}`
        : '');

    return {
      businessName:   p.organization?.name   || '',
      ownerFirstName: p.first_name            || '',
      ownerLastName:  p.last_name             || '',
      phone:          phone.replace(/\s+/g, ''), // strip extra whitespace
      city:           p.city                  || p.state || '',
      website,
    };
  // Final safety filter: must have both a business name and a phone number
  }).filter(lead => lead.businessName.trim() && lead.phone.trim());
}

// ============================================================
// GOOGLE SHEETS
// ============================================================

/**
 * Load OAuth2 client from saved token.
 * Token is written once by setup-google-auth.js.
 */
function getGoogleAuth() {
  if (!fs.existsSync(CONFIG.tokenPath)) {
    throw new Error(
      'Google token not found. Run: node setup-google-auth.js'
    );
  }

  const credentialsJson = process.env.GOOGLE_CREDENTIALS;
  if (!credentialsJson) {
    throw new Error('GOOGLE_CREDENTIALS not set in .env');
  }

  const credentials = JSON.parse(credentialsJson);
  const { client_id, client_secret, redirect_uris } =
    credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const token = JSON.parse(fs.readFileSync(CONFIG.tokenPath, 'utf8'));
  oAuth2Client.setCredentials(token);

  // Auto-refresh tokens and persist the new ones
  oAuth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      const saved = JSON.parse(fs.readFileSync(CONFIG.tokenPath, 'utf8'));
      saved.refresh_token = tokens.refresh_token;
      fs.writeFileSync(CONFIG.tokenPath, JSON.stringify(saved, null, 2));
    }
  });

  return oAuth2Client;
}

/**
 * Read all Business Names from Column B of the sheet.
 * Returns a lowercase Set for case-insensitive duplicate detection.
 */
async function getExistingBusinessNames(sheets) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetTab}!B:B`,
  });

  const rows = result.data.values || [];
  // Row 0 is the header "Business Name" — skip it
  return new Set(
    rows.slice(1).map(r => (r[0] || '').toLowerCase().trim())
  );
}

/**
 * Append an array of lead objects as new rows at the bottom of the sheet.
 * Columns: Date Added | Business Name | Owner First | Owner Last |
 *          Phone | City | Website | Called (blank) | Notes (blank)
 */
async function appendLeadsToSheet(sheets, leads) {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const rows = leads.map(lead => [
    today,                  // A: Date Added
    lead.businessName,      // B: Business Name
    lead.ownerFirstName,    // C: Owner First Name
    lead.ownerLastName,     // D: Owner Last Name
    lead.phone,             // E: Phone Number
    lead.city,              // F: City
    lead.website,           // G: Website
    '',                     // H: Called (intentionally blank)
    '',                     // I: Notes (intentionally blank)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetTab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new rows`);
}

// ============================================================
// ERROR NOTIFICATION
// ============================================================

/**
 * Log errors to file, and optionally send an email alert.
 * Email requires SMTP_HOST, SMTP_USER, SMTP_PASS in .env.
 */
async function sendErrorNotification(error, context) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ERROR — ${context}: ${error.message}`;

  console.error(message);

  // Always write to local log file
  fs.appendFileSync(
    path.join(__dirname, 'error.log'),
    message + '\n'
  );

  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    console.warn('[Notify] SMTP not configured — error logged to error.log only');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: CONFIG.notificationEmail,
      subject: `[HVAC Lead Gen] Error — ${context}`,
      text: [
        'The HVAC lead generation script encountered an error and needs attention.\n',
        `Context:   ${context}`,
        `Error:     ${error.message}`,
        `Timestamp: ${timestamp}`,
        '',
        'Check error.log on the machine running the script for full details.',
        '',
        `Spreadsheet: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}`,
      ].join('\n'),
    });

    console.log(`[Notify] Error alert sent to ${CONFIG.notificationEmail}`);
  } catch (emailErr) {
    console.error(`[Notify] Could not send email: ${emailErr.message}`);
  }
}

// ============================================================
// MAIN RUN FUNCTION
// ============================================================

async function runLeadGeneration() {
  const runStarted = new Date().toISOString();
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`[Run] Lead generation started — ${runStarted}`);
  console.log(`${'─'.repeat(55)}`);

  // Step 1: Pull leads from Apollo
  let rawLeads;
  try {
    rawLeads = await searchApolloLeads();
  } catch (err) {
    await sendErrorNotification(err, 'Apollo search failed');
    return;
  }

  if (rawLeads.length === 0) {
    const err = new Error(
      'Apollo returned 0 leads with phone numbers for the configured cities and industries.'
    );
    await sendErrorNotification(err, 'Apollo returned no usable results');
    return;
  }

  // Step 2: Authenticate with Google Sheets
  let sheets;
  try {
    const auth = getGoogleAuth();
    sheets = google.sheets({ version: 'v4', auth });
  } catch (err) {
    await sendErrorNotification(err, 'Google Sheets authentication failed');
    return;
  }

  // Step 3: Read existing business names to de-duplicate
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`[Sheets] Existing businesses in spreadsheet: ${existingNames.size}`);
  } catch (err) {
    await sendErrorNotification(err, 'Failed to read existing spreadsheet data');
    return;
  }

  // Step 4: Remove duplicates
  const newLeads = rawLeads.filter(
    lead => !existingNames.has(lead.businessName.toLowerCase().trim())
  );
  console.log(`[Run] New leads after duplicate check: ${newLeads.length}`);

  if (newLeads.length === 0) {
    console.log('[Run] All Apollo results are already in the spreadsheet — nothing added.');
    return;
  }

  // Step 5: Cap at maxLeadsPerRun
  const toAdd = newLeads.slice(0, CONFIG.maxLeadsPerRun);
  console.log(`[Run] Adding ${toAdd.length} leads (max per run: ${CONFIG.maxLeadsPerRun})`);

  // Step 6: Write to Google Sheets
  try {
    await appendLeadsToSheet(sheets, toAdd);
  } catch (err) {
    await sendErrorNotification(err, 'Google Sheets write failed');
    return;
  }

  console.log(`[Run] ✓ Complete — ${toAdd.length} leads added`);
  console.log(`[Run] View sheet: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}`);
}

// ============================================================
// CONNECTION VERIFICATION (run before first scheduled run)
// ============================================================

async function verifyConnections() {
  console.log('\n──────────────────────────────────────────────');
  console.log(' HVAC Lead Gen — Connection Verification');
  console.log('──────────────────────────────────────────────\n');

  let allOk = true;

  // ── Apollo ──
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    console.error('❌ APOLLO_API_KEY missing — add it to .env');
    allOk = false;
  } else {
    try {
      // Minimal search just to confirm the key and plan work
      await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/search',
        { api_key: apolloKey, per_page: 1, page: 1 },
        { timeout: 15000 }
      );
      console.log('✅ Apollo API: Connected and plan supports people search');
    } catch (err) {
      const code = err.response?.data?.error_code;
      if (code === 'API_INACCESSIBLE') {
        console.error(
          '❌ Apollo API: Key is valid but your plan does not include API access.\n' +
          '   Upgrade at https://www.apollo.io/pricing (Basic plan or higher required).'
        );
      } else {
        console.error(`❌ Apollo API: ${err.response?.data?.message || err.message}`);
      }
      allOk = false;
    }
  }

  // ── Google Sheets ──
  if (!process.env.GOOGLE_CREDENTIALS) {
    console.error('❌ GOOGLE_CREDENTIALS missing — add it to .env (see .env.example)');
    allOk = false;
  } else if (!fs.existsSync(CONFIG.tokenPath)) {
    console.error('❌ Google token not found.\n   Run: npm run auth');
    allOk = false;
  } else {
    try {
      const auth = getGoogleAuth();
      const sheets = google.sheets({ version: 'v4', auth });
      const res = await sheets.spreadsheets.get({
        spreadsheetId: CONFIG.spreadsheetId,
      });
      console.log(`✅ Google Sheets: Connected — "${res.data.properties.title}"`);
    } catch (err) {
      console.error(`❌ Google Sheets: ${err.message}`);
      allOk = false;
    }
  }

  console.log('');

  if (!allOk) {
    console.error('One or more connections failed. Fix the errors above and retry.\n');
    process.exit(1);
  }

  console.log('✅ All connections OK');
  console.log(`\nScheduler will run every day at 7:00 AM Eastern (${CONFIG.cronTimezone})`);
  console.log(`Max leads per run: ${CONFIG.maxLeadsPerRun}`);
  console.log(`Cities: ${CONFIG.targetCities.join(', ')}`);
  console.log(
    `Spreadsheet: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}\n`
  );
}

// ============================================================
// ENTRY POINT
// ============================================================

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  // Only check connections, then exit
  verifyConnections().catch(err => {
    console.error(err.message);
    process.exit(1);
  });

} else if (args.includes('--run-now')) {
  // Pull leads immediately (useful for testing)
  console.log('[Mode] Running immediately (--run-now)\n');
  runLeadGeneration()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });

} else {
  // Normal startup: verify connections, then launch the daily scheduler
  verifyConnections().then(() => {
    cron.schedule(CONFIG.cronSchedule, () => {
      console.log('[Cron] Triggered — starting lead generation run');
      runLeadGeneration().catch(err =>
        sendErrorNotification(err, 'Unhandled error in scheduled run')
      );
    }, { timezone: CONFIG.cronTimezone });

    console.log('[Scheduler] Active. Waiting for next 7:00 AM Eastern trigger.');
    console.log('[Scheduler] Press Ctrl+C to stop.\n');
  }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
