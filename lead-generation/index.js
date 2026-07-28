/**
 * HVAC Lead Generation Workflow
 *
 * Searches Apollo.io for HVAC company owners in Southwest Michigan,
 * deduplicates against an existing Google Sheet, and appends new leads.
 * Runs automatically at 7:00 AM Eastern Time every day via node-cron.
 *
 * Usage:
 *   node index.js                   Start the scheduler (runs daily at 7am ET)
 *   node index.js --run-now         Run one pull immediately (for testing)
 *   node index.js --check-connections  Verify Apollo + Google Sheets are connected
 */

require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — edit these sections to customize the workflow
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Target cities in Southwest Michigan. Add or remove cities here freely.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Job titles to target, checked in priority order.
  // Apollo fuzzy-matches these, so "Owner" will also catch "Co-Owner", etc.
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // Industry keywords used to filter companies in Apollo.
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // Company size filter: 1–25 employees (owner-operated small businesses).
  // To change, edit this string: e.g. '1,10' or '1,50'
  employeeRange: '1,25',

  // Maximum new unique leads to add per scheduled run.
  maxLeadsPerRun: 25,

  // Google Sheets settings — pulled from env vars; edit GOOGLE_SPREADSHEET_ID in .env
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  sheetName: process.env.SHEET_NAME || 'Sheet1',

  // Email address to notify when an error occurs.
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',
};

// ─────────────────────────────────────────────────────────────────────────────
// Apollo.io — People Search
// ─────────────────────────────────────────────────────────────────────────────

async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const seen = new Set(); // deduplicate within the search loop itself
  const candidates = [];

  // Search each target city separately to increase geographic coverage.
  // Apollo's location filter is fuzzy, so per-city calls surface more relevant results.
  for (const city of CONFIG.cities) {
    if (candidates.length >= CONFIG.maxLeadsPerRun * 3) break; // gather ~3x for post-filter headroom

    const needed = Math.min(25, CONFIG.maxLeadsPerRun * 3 - candidates.length);

    try {
      const response = await axios.post(
        'https://api.apollo.io/v1/mixed_people/search',
        {
          person_titles: CONFIG.jobTitles,
          organization_locations: [city],
          organization_num_employees_ranges: [CONFIG.employeeRange],
          q_organization_keyword_tags: CONFIG.industryKeywords,
          page: 1,
          per_page: needed,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          timeout: 15000,
        }
      );

      const people = response.data?.people || [];

      for (const person of people) {
        if (!seen.has(person.id)) {
          seen.add(person.id);
          candidates.push(person);
        }
      }

      console.log(`  ${city}: ${people.length} result(s) from Apollo.`);
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.message || err.message;
      console.warn(`  Warning: Apollo search failed for "${city}": ${detail}`);
    }
  }

  return candidates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apollo.io — People Enrichment (phone number retrieval)
// ─────────────────────────────────────────────────────────────────────────────

async function enrichPerson(personId) {
  const apiKey = process.env.APOLLO_API_KEY;
  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/people/match',
      {
        id: personId,
        reveal_phone_number: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        timeout: 15000,
      }
    );
    return response.data?.person || null;
  } catch (err) {
    const detail = err.response?.data?.error || err.response?.data?.message || err.message;
    console.warn(`  Enrichment skipped for ${personId}: ${detail}`);
    return null;
  }
}

// Extract the best available phone number, preferring mobile over landline.
function extractPhone(person) {
  const numbers = person?.phone_numbers || [];

  // Priority order for phone type
  const priority = ['mobile', 'direct_phone', 'work_hq', 'work', 'other'];
  for (const type of priority) {
    const match = numbers.find((n) => n.type === type && n.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fallback: first number regardless of type
  return numbers.find((n) => n.sanitized_number)?.sanitized_number || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets — client, header check, read, append
// ─────────────────────────────────────────────────────────────────────────────

async function getGoogleSheetsClient() {
  // Authenticates using a service account credentials JSON file.
  // Set GOOGLE_APPLICATION_CREDENTIALS in .env to the path of that file.
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Write the header row if the sheet is completely empty.
async function ensureHeaderRow(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A1:I1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${CONFIG.sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Date Added',
          'Business Name',
          'Owner First Name',
          'Owner Last Name',
          'Phone Number',
          'City',
          'Website',
          'Called',
          'Notes',
        ]],
      },
    });
    console.log('  Header row written to sheet.');
  }
}

// Returns a Set of lowercased business names already in the sheet (for dedup).
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!B:B`, // Business Name column
  });
  const rows = res.data.values || [];
  // rows[0] is the header; skip it
  return new Set(rows.slice(1).map((r) => (r[0] || '').trim().toLowerCase()));
}

// Append rows to the sheet.
async function appendLeadsToSheet(sheets, leads) {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const rows = leads.map((lead) => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank for manual use
    '', // Notes  — left blank for manual use
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${CONFIG.sheetName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Error notifications
// ─────────────────────────────────────────────────────────────────────────────

async function notifyError(context, err) {
  const timestamp = new Date().toISOString();
  const msg = `[HVAC Lead Gen ERROR] ${context}: ${err.message}`;
  console.error(`\n${timestamp} ${msg}`);

  // Optional SMTP email notification — configure SMTP_* vars in .env to enable.
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"HVAC Lead Bot" <${process.env.SMTP_USER}>`,
        to: CONFIG.notificationEmail,
        subject: `[HVAC Lead Gen] Error — Action Required (${timestamp})`,
        text: [
          msg,
          '',
          `Timestamp: ${timestamp}`,
          `Context:   ${context}`,
          `Error:     ${err.message}`,
          '',
          err.stack || '(no stack trace)',
        ].join('\n'),
      });

      console.log(`  Error notification sent to ${CONFIG.notificationEmail}`);
    } catch (mailErr) {
      console.error(`  Failed to send error email: ${mailErr.message}`);
    }
  } else {
    console.log(
      '  (Email notification not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS in .env to enable)'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection check — run with --check-connections before first scheduled run
// ─────────────────────────────────────────────────────────────────────────────

async function checkConnections() {
  console.log('\nChecking Apollo.io connection...');
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) throw new Error('APOLLO_API_KEY is not set in .env');

    // Lightweight call to verify the API key works
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { person_titles: ['Owner'], organization_locations: ['Michigan'], per_page: 1 },
      { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }, timeout: 10000 }
    );

    const count = res.data?.pagination?.total_entries ?? '?';
    console.log(`  Apollo OK — API key valid. (Total matching people in DB: ${count})`);
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    console.error(`  Apollo FAILED: ${detail}`);
    return false;
  }

  console.log('\nChecking Google Sheets connection...');
  try {
    if (!CONFIG.spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set in .env');
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.spreadsheetId });
    console.log(`  Google Sheets OK — Connected to: "${res.data.properties.title}"`);
  } catch (err) {
    console.error(`  Google Sheets FAILED: ${err.message}`);
    console.error('  Make sure credentials.json exists and the sheet is shared with your service account.');
    return false;
  }

  console.log('\nAll connections verified. The scheduler is ready to run.\n');
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main lead generation run
// ─────────────────────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const startTime = new Date();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Run started: ${startTime.toISOString()}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // ── Step 1: Search Apollo for candidate leads ──────────────────────────
    console.log('\n[1/4] Searching Apollo.io for HVAC leads in Southwest Michigan...');
    const candidates = await searchApolloLeads();
    console.log(`  Total candidates found: ${candidates.length}`);

    if (candidates.length === 0) {
      await notifyError(
        'Apollo Search returned 0 results',
        new Error('No candidates matched the search filters. Check APOLLO_API_KEY and filter settings.')
      );
      return;
    }

    // ── Step 2: Enrich candidates to retrieve phone numbers ────────────────
    console.log('\n[2/4] Enriching candidates for phone numbers...');
    const enriched = [];
    for (const person of candidates) {
      const full = await enrichPerson(person.id);
      if (full) enriched.push(full);
    }

    // Filter down to those with at least one phone number
    const withPhone = enriched.filter((p) => extractPhone(p));
    console.log(
      `  ${withPhone.length} of ${enriched.length} enriched candidates have a phone number.`
    );

    if (withPhone.length === 0) {
      console.log('  No enriched contacts have phone numbers — nothing to add this run.');
      return;
    }

    // ── Step 3: Connect to Google Sheets and deduplicate ───────────────────
    console.log('\n[3/4] Connecting to Google Sheets and checking for duplicates...');
    const sheets = await getGoogleSheetsClient();
    await ensureHeaderRow(sheets);
    const existingNames = await getExistingBusinessNames(sheets);
    console.log(`  ${existingNames.size} existing business name(s) already in the sheet.`);

    // Build list of new, unique leads up to the per-run cap
    const newLeads = [];

    for (const person of withPhone) {
      if (newLeads.length >= CONFIG.maxLeadsPerRun) break;

      const businessName = (person.organization?.name || '').trim();
      if (!businessName) continue;

      const nameLower = businessName.toLowerCase();
      if (existingNames.has(nameLower)) {
        console.log(`  Skipping duplicate: ${businessName}`);
        continue;
      }

      // Verify the lead is in Michigan (Apollo location filter is fuzzy)
      const personState = (person.state || '').toLowerCase();
      const orgState = (person.organization?.raw_address || '').toLowerCase();
      const isMichigan =
        personState.includes('michigan') ||
        orgState.includes('michigan') ||
        orgState.includes(', mi');

      if (!isMichigan) {
        console.log(`  Skipping out-of-state result: ${businessName}`);
        continue;
      }

      const city =
        person.city ||
        person.organization?.city ||
        '';

      newLeads.push({
        businessName,
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        phone: extractPhone(person),
        city,
        website: person.organization?.website_url || '',
      });

      // Track within this run to prevent intra-run duplicates
      existingNames.add(nameLower);
    }

    console.log(`  ${newLeads.length} new unique lead(s) ready to add.`);

    // ── Step 4: Append to Google Sheet ────────────────────────────────────
    console.log('\n[4/4] Writing new leads to Google Sheet...');
    if (newLeads.length === 0) {
      console.log('  Nothing new to add this run.');
    } else {
      await appendLeadsToSheet(sheets, newLeads);
      console.log(`  Successfully added ${newLeads.length} lead(s) to the sheet.`);
      newLeads.forEach((l, i) => {
        console.log(`    ${i + 1}. ${l.businessName} — ${l.city} — ${l.phone}`);
      });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nRun complete in ${elapsed}s.\n`);
  } catch (err) {
    await notifyError('Lead generation run failed', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point — scheduler + CLI flags
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--check-connections')) {
  // Verify both APIs are reachable before committing to a scheduled run
  checkConnections().then((ok) => process.exit(ok ? 0 : 1));
} else if (args.includes('--run-now')) {
  // Immediate one-off run for testing or manual use
  runLeadGeneration();
} else {
  // Default: start the daily scheduler
  // Cron expression: minute=0, hour=7, every day, every month, any day-of-week
  // timezone: America/New_York handles EST/EDT automatically (no manual DST adjustment needed)
  cron.schedule('0 7 * * *', runLeadGeneration, {
    timezone: 'America/New_York',
  });

  console.log('HVAC Lead Generator running. Scheduled for 7:00 AM Eastern every day.');
  console.log(`Target sheet ID: ${CONFIG.spreadsheetId || '(not set — check GOOGLE_SPREADSHEET_ID in .env)'}`);
  console.log('Press Ctrl+C to stop.\n');
}
