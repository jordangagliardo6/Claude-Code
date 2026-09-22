/**
 * Apollo.io → Google Sheets Lead Generator
 * Searches Apollo for HVAC owner-operators in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends new leads.
 * Runs on a node-cron schedule at 7:00 AM Eastern time.
 *
 * Usage:
 *   node lead-generator.js           — start the scheduler (keeps running)
 *   node lead-generator.js --test    — run one fetch immediately, then exit
 *   node lead-generator.js --verify  — check Apollo + Google Sheets connectivity
 */

'use strict';

require('dotenv').config();

const axios  = require('axios');
const cron   = require('node-cron');
const { google } = require('googleapis');

// ─── Config ────────────────────────────────────────────────────────────────────

const CONFIG = {
  apolloApiKey:       process.env.APOLLO_API_KEY,
  googleSheetId:      process.env.GOOGLE_SHEET_ID,
  serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/service-account.json',
  sheetTabName:       process.env.SHEET_TAB_NAME || 'Sheet1',
  alertEmail:         process.env.ALERT_EMAIL,
  smtpUser:           process.env.SMTP_USER,
  smtpPass:           process.env.SMTP_PASS,
  maxLeadsPerRun:     parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),

  // ── Modify these to change target cities ──────────────────────────────────
  cities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // ── Modify these to change target job titles (priority order) ─────────────
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Modify these to change target industries ──────────────────────────────
  industries: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],
};

// ─── Google Sheets client ──────────────────────────────────────────────────────

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.serviceAccountPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ─── Error notification ────────────────────────────────────────────────────────

async function notifyError(message) {
  const ts = new Date().toISOString();
  console.error(`\n[LEAD-GEN ERROR] ${ts}\n${message}\n`);

  // Send email alert if SMTP credentials are configured
  if (CONFIG.smtpUser && CONFIG.smtpPass && CONFIG.alertEmail) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: CONFIG.smtpUser, pass: CONFIG.smtpPass },
      });
      await transporter.sendMail({
        from: CONFIG.smtpUser,
        to: CONFIG.alertEmail,
        subject: `[Lead Generator] Error — ${ts}`,
        text: `Lead generation error at ${ts}:\n\n${message}`,
      });
      console.log('[LEAD-GEN] Error alert email sent.');
    } catch (emailErr) {
      console.error('[LEAD-GEN] Could not send error email:', emailErr.message);
    }
  }
}

// ─── Apollo: search for people ────────────────────────────────────────────────

async function searchApolloLeads(page = 1) {
  // Apollo people search — requires Basic plan ($49/mo) or higher.
  // Endpoint docs: https://apolloio.github.io/apollo-api-docs/#mixed-people-api
  const payload = {
    api_key: CONFIG.apolloApiKey,

    // Keywords to bias results toward HVAC/plumbing in SW Michigan
    q_keywords: `HVAC heating air conditioning plumbing mechanical ${CONFIG.cities.join(' ')} Michigan`,

    // Job title filters (exact match; no fuzzy expansion)
    person_titles:           CONFIG.targetTitles,
    include_similar_titles:  false,

    // Geography — person's location AND company HQ both in Michigan
    person_locations:       ['Michigan, United States'],
    organization_locations: ['Michigan, United States'],

    // Industry tags on the company record
    q_organization_keyword_tags: CONFIG.industries,

    // Company size: 1–25 employees only
    organization_num_employees_ranges: ['1,10', '11,25'],

    per_page: CONFIG.maxLeadsPerRun,
    page,
  };

  const { data } = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    payload,
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } },
  );

  return data;
}

// ─── Apollo: enrich contacts to reveal phone numbers ─────────────────────────

async function enrichContacts(personIds) {
  if (!personIds.length) return [];

  // Bulk People Match endpoint reveals phone numbers.
  // Free plan: 50 credits/month. Basic+: 1,000+/month.
  const { data } = await axios.post(
    'https://api.apollo.io/api/v1/people/bulk_match',
    {
      api_key: CONFIG.apolloApiKey,
      details: personIds.map(id => ({ id })),
      reveal_personal_emails: false,
      reveal_phone_number:    true,
    },
    { headers: { 'Content-Type': 'application/json' } },
  );

  return data.matches || [];
}

// ─── Pick the best available phone number ────────────────────────────────────

function bestPhone(phoneNumbers = []) {
  if (!phoneNumbers.length) return null;
  // Prefer mobile, then direct, then anything
  const order = ['mobile', 'direct_phone', 'work_hq', 'other'];
  for (const type of order) {
    const match = phoneNumbers.find(p => p.type === type);
    if (match?.sanitized_number) return match.sanitized_number;
  }
  return phoneNumbers[0]?.sanitized_number || null;
}

// ─── Format an Apollo person record into a sheet row ─────────────────────────

function formatLead(person, enrichedMap) {
  const enriched = enrichedMap[person.id] || {};
  const org = person.organization || {};
  const phoneNumbers = enriched.phone_numbers || person.phone_numbers || [];
  const phone = bestPhone(phoneNumbers);

  // Prefer city from person record, fall back to org HQ city
  const city = (person.city || org.city || '').trim();

  return {
    businessName:   (org.name || '').trim(),
    ownerFirstName: (person.first_name || '').trim(),
    ownerLastName:  (person.last_name || '').trim(),
    phoneNumber:    phone || '',
    city,
    website:        (org.website_url || '').trim(),
    hasPhone:       !!phone,
    inMichigan:     (person.state || org.state || '').toLowerCase().includes('michigan'),
  };
}

// ─── Read existing Business Names from the sheet (for dedup) ─────────────────

async function getExistingBusinessNames(sheets) {
  const range = `${CONFIG.sheetTabName}!B2:B`; // Column B = Business Name, skip header row

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.googleSheetId,
    range,
  });

  const rows = res.data.values || [];
  // Return a lowercase Set for case-insensitive comparison
  return new Set(rows.flat().map(n => n.trim().toLowerCase()).filter(Boolean));
}

// ─── Append new leads to the sheet ───────────────────────────────────────────

async function appendLeadsToSheet(sheets, leads) {
  if (!leads.length) return 0;

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  // Column order must match the sheet headers:
  // Date Added | Business Name | Owner First Name | Owner Last Name |
  // Phone Number | City | Website | Called | Notes
  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.ownerFirstName,
    lead.ownerLastName,
    lead.phoneNumber,
    lead.city,
    lead.website,
    '', // Called — left blank for manual use
    '', // Notes  — left blank for manual use
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.googleSheetId,
    range:         `${CONFIG.sheetTabName}!A:I`,
    valueInputOption:  'RAW',
    insertDataOption:  'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

// ─── Connectivity check ───────────────────────────────────────────────────────

async function verifyConnections() {
  console.log('\n[VERIFY] Checking Apollo.io connection...');

  if (!CONFIG.apolloApiKey) {
    console.error('[VERIFY] ✗ APOLLO_API_KEY is not set in .env');
  } else {
    try {
      // Use the account profile endpoint (free tier) to validate the key
      const { data } = await axios.get(
        `https://api.apollo.io/api/v1/auth/health?api_key=${CONFIG.apolloApiKey}`,
      );
      if (data.is_logged_in) {
        console.log(`[VERIFY] ✓ Apollo connected — logged in as ${data.email || 'unknown'}`);
      } else {
        console.error('[VERIFY] ✗ Apollo key is invalid or expired');
      }
    } catch (err) {
      const detail = err.response?.data?.error || err.message;
      console.error(`[VERIFY] ✗ Apollo connection failed: ${detail}`);
    }
  }

  console.log('\n[VERIFY] Checking Google Sheets connection...');

  if (!CONFIG.googleSheetId) {
    console.error('[VERIFY] ✗ GOOGLE_SHEET_ID is not set in .env');
  } else {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.get({
        spreadsheetId: CONFIG.googleSheetId,
        fields: 'properties.title',
      });
      console.log(`[VERIFY] ✓ Google Sheets connected — sheet: "${res.data.properties.title}"`);
    } catch (err) {
      console.error(`[VERIFY] ✗ Google Sheets failed: ${err.message}`);
      console.error('         Make sure the service account has Editor access to the sheet.');
    }
  }

  console.log('\n[VERIFY] Done. Fix any ✗ items above before the first scheduled run.\n');
}

// ─── Main run ─────────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const runStart = new Date();
  console.log(`\n[LEAD-GEN] ── Starting run at ${runStart.toISOString()} ──`);

  // Validate required env vars up front
  if (!CONFIG.apolloApiKey) {
    await notifyError('APOLLO_API_KEY is missing from .env — aborting run.');
    return;
  }
  if (!CONFIG.googleSheetId) {
    await notifyError('GOOGLE_SHEET_ID is missing from .env — aborting run.');
    return;
  }

  // ── 1. Connect to Google Sheets ──────────────────────────────────────────
  let sheets;
  try {
    sheets = getSheetsClient();
    console.log('[LEAD-GEN] Google Sheets client initialised.');
  } catch (err) {
    await notifyError(`Google Sheets auth failed: ${err.message}`);
    return;
  }

  // ── 2. Load existing business names for dedup ─────────────────────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`[LEAD-GEN] Sheet has ${existingNames.size} existing business(es) to skip.`);
  } catch (err) {
    await notifyError(`Could not read Google Sheet (check permissions): ${err.message}`);
    return;
  }

  // ── 3. Search Apollo for new candidates ──────────────────────────────────
  let apolloData;
  try {
    apolloData = await searchApolloLeads();
    console.log(`[LEAD-GEN] Apollo returned ${(apolloData.people || []).length} candidate(s).`);
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    await notifyError(
      `Apollo search failed: ${detail}\n` +
      'NOTE: People Search requires an Apollo Basic plan ($49/mo) or higher.\n' +
      'Your current plan may only support People Enrichment (50/month).\n' +
      'Upgrade at https://www.apollo.io/pricing',
    );
    return;
  }

  const candidates = apolloData.people || [];
  if (!candidates.length) {
    await notifyError(
      'Apollo returned 0 results for Southwest Michigan HVAC contacts.\n' +
      'Possible causes: search filters are too narrow, or API plan lacks search access.',
    );
    return;
  }

  // ── 4. Enrich to get phone numbers ────────────────────────────────────────
  let enrichedMap = {};
  try {
    const ids = candidates.map(p => p.id).filter(Boolean);
    const enriched = await enrichContacts(ids);
    enrichedMap = Object.fromEntries(enriched.map(e => [e.id, e]));
    console.log(`[LEAD-GEN] Enriched ${enriched.length} contact(s) for phone numbers.`);
  } catch (err) {
    // Non-fatal — we'll still process what the search returned
    console.warn(`[LEAD-GEN] Enrichment failed (continuing without phone data): ${err.message}`);
  }

  // ── 5. Format, filter, deduplicate ───────────────────────────────────────
  const newLeads = [];
  let skippedDup   = 0;
  let skippedPhone = 0;

  for (const person of candidates) {
    const lead = formatLead(person, enrichedMap);

    if (!lead.businessName) continue;

    if (!lead.hasPhone) {
      skippedPhone++;
      continue; // Skip contacts with no phone number, per requirements
    }

    if (existingNames.has(lead.businessName.toLowerCase())) {
      skippedDup++;
      console.log(`[LEAD-GEN]   Duplicate — skipping: ${lead.businessName}`);
      continue;
    }

    newLeads.push(lead);
    if (newLeads.length >= CONFIG.maxLeadsPerRun) break;
  }

  console.log(
    `[LEAD-GEN] Filtered: ${newLeads.length} new | ` +
    `${skippedDup} duplicates | ${skippedPhone} no-phone`,
  );

  if (!newLeads.length) {
    console.log('[LEAD-GEN] Nothing new to add — all results already in the sheet.');
    return;
  }

  // ── 6. Append to Google Sheet ─────────────────────────────────────────────
  try {
    const added = await appendLeadsToSheet(sheets, newLeads);
    const elapsed = ((Date.now() - runStart.getTime()) / 1000).toFixed(1);
    console.log(`[LEAD-GEN] ✓ Added ${added} lead(s) to sheet in ${elapsed}s.`);
  } catch (err) {
    await notifyError(`Google Sheets write failed: ${err.message}`);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  // One-shot connectivity check, then exit
  verifyConnections().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });

} else if (args.includes('--test')) {
  // One-shot lead pull, then exit
  console.log('[LEAD-GEN] Running in --test mode (single run, then exit).');
  runLeadGeneration().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });

} else {
  // Production mode — start the cron scheduler and keep the process alive
  cron.schedule('0 7 * * *', () => {
    runLeadGeneration().catch(err => notifyError(`Unhandled error in cron run: ${err.message}`));
  }, {
    scheduled: true,
    timezone: 'America/New_York', // 7 AM Eastern
  });

  console.log('[LEAD-GEN] Scheduler started — will run daily at 7:00 AM Eastern.');
  console.log('[LEAD-GEN] Run "node lead-generator.js --test" to trigger an immediate test.');
  console.log('[LEAD-GEN] Run "node lead-generator.js --verify" to check connections.\n');
}
