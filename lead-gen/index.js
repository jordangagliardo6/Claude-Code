require('dotenv').config();
const cron = require('node-cron');
const { searchHvacLeads, enrichPeoplePhones, extractSwMichiganCity, mapToSheetRow } = require('./apollo');
const { appendNewLeads } = require('./sheets');
const config = require('./config');

// ---------------------------------------------------------------------------
// Configuration — pulled from env vars at runtime
// ---------------------------------------------------------------------------
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com';

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(context, err) {
  console.error(`[${new Date().toISOString()}] ERROR — ${context}`);
  console.error(err?.response?.data || err?.message || err);
}

// ---------------------------------------------------------------------------
// Core workflow
// ---------------------------------------------------------------------------
async function runLeadGeneration() {
  log('Starting HVAC lead generation run...');

  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY environment variable is not set.');
  }
  if (!SPREADSHEET_ID) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set.');
  }

  // 1. Search Apollo for HVAC owners in Michigan
  log('Searching Apollo for HVAC contacts in Southwest Michigan...');
  let people;
  try {
    people = await searchHvacLeads(1);
  } catch (err) {
    // Surface the specific error message so free-plan users see the upgrade note
    const apolloMsg = err?.response?.data?.error || err.message;
    throw new Error(`Apollo search failed: ${apolloMsg}`);
  }
  log(`Apollo returned ${people.length} candidates before filtering.`);

  // 2. Filter to Southwest Michigan cities only
  const swMichiganPeople = people.filter((p) => extractSwMichiganCity(p));
  log(`${swMichiganPeople.length} candidates match Southwest Michigan cities.`);

  if (!swMichiganPeople.length) {
    log('No Southwest Michigan matches this run — nothing to write.');
    return { written: 0, total: 0 };
  }

  // 3. Enrich with phone numbers (async Apollo waterfall)
  log('Enriching contacts with phone numbers...');
  let enriched;
  try {
    enriched = await enrichPeoplePhones(swMichiganPeople);
  } catch (err) {
    throw new Error(`Apollo phone enrichment failed: ${err.message}`);
  }
  log(`Received ${enriched.length} enriched contacts.`);

  // 4. Map to sheet rows, drop anyone with no phone number
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: config.CRON_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const rows = enriched
    .map((p) => mapToSheetRow(p, today))
    .filter(Boolean)
    .slice(0, config.MAX_LEADS_PER_RUN);

  log(`${rows.length} rows ready to write after filtering (phone required, max ${config.MAX_LEADS_PER_RUN}).`);

  if (!rows.length) {
    log('No rows with phone numbers found this run.');
    return { written: 0, total: enriched.length };
  }

  // 5. Append to Google Sheet, skipping duplicates
  log(`Writing to spreadsheet ${SPREADSHEET_ID} / sheet "${SHEET_NAME}"...`);
  let written;
  try {
    written = await appendNewLeads(SPREADSHEET_ID, SHEET_NAME, rows);
  } catch (err) {
    throw new Error(`Google Sheets write failed: ${err.message}`);
  }

  log(`Run complete. ${written} new leads added (${rows.length - written} skipped as duplicates).`);
  return { written, total: rows.length };
}

// ---------------------------------------------------------------------------
// Error handling wrapper — logs clearly and could send email alert
// ---------------------------------------------------------------------------
async function runWithErrorHandling() {
  try {
    const result = await runLeadGeneration();
    log(`SUCCESS: wrote ${result.written} leads.`);
  } catch (err) {
    logError('Lead generation run failed', err);

    // Print alert info so you know to check it manually
    console.error('');
    console.error('='.repeat(60));
    console.error('ALERT: Lead generation run failed!');
    console.error(`Notify: ${ALERT_EMAIL}`);
    console.error(`Reason: ${err.message}`);
    console.error('='.repeat(60));

    // Optional: send email via nodemailer if configured (see SETUP.md)
    // await sendAlertEmail(ALERT_EMAIL, err.message);

    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Connectivity check — run before first scheduled execution
// ---------------------------------------------------------------------------
async function verifyConnections() {
  log('Verifying Apollo connection...');
  if (!process.env.APOLLO_API_KEY) {
    console.error('  ✗ APOLLO_API_KEY is not set.');
    return false;
  }

  const axios = require('axios');
  try {
    // Lightweight endpoint to confirm the API key works
    const res = await axios.get('https://api.apollo.io/api/v1/users/api_profile', {
      headers: { 'X-Api-Key': process.env.APOLLO_API_KEY },
      timeout: 10000,
    });
    log(`  ✓ Apollo connected. User: ${res.data?.user?.email || 'unknown'}`);
  } catch (err) {
    const msg = err?.response?.data?.error || err.message;
    console.error(`  ✗ Apollo connection failed: ${msg}`);
    return false;
  }

  log('Verifying Google Sheets connection...');
  if (!SPREADSHEET_ID) {
    console.error('  ✗ GOOGLE_SPREADSHEET_ID is not set.');
    return false;
  }
  try {
    const { getAuthClient, ensureHeaders } = require('./sheets');
    const auth = await getAuthClient();
    await ensureHeaders(auth, SPREADSHEET_ID, SHEET_NAME);
    log(`  ✓ Google Sheets connected. Spreadsheet ID: ${SPREADSHEET_ID}`);
  } catch (err) {
    console.error(`  ✗ Google Sheets connection failed: ${err.message}`);
    return false;
  }

  log('All connections verified. Scheduler is ready.');
  return true;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
  const runNow = process.argv.includes('--run-now');

  log(`HVAC Lead Gen starting (schedule: ${config.CRON_SCHEDULE} ${config.CRON_TIMEZONE})`);

  const ok = await verifyConnections();
  if (!ok) {
    console.error('\nFix the errors above, then restart. See SETUP.md for instructions.');
    process.exit(1);
  }

  if (runNow) {
    log('--run-now flag detected: executing one run immediately.');
    await runWithErrorHandling();
    return;
  }

  log(`Scheduler armed. Next run at 7:00 AM Eastern. Process will stay alive.`);
  cron.schedule(config.CRON_SCHEDULE, runWithErrorHandling, {
    timezone: config.CRON_TIMEZONE,
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
