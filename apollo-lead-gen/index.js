/**
 * index.js
 * Main entry point for the Apollo HVAC Lead Generation workflow.
 *
 * Runs a cron job at 7:00 AM Eastern Time every day.
 * Each run:
 *   1. Reads existing business names from Google Sheets (for dedup)
 *   2. Searches Apollo.io for HVAC owners in SW Michigan
 *   3. Appends up to 25 new leads to the sheet
 *   4. Logs results and errors clearly
 *
 * Start: node index.js
 * First-run test: node test-connection.js
 */

require('dotenv').config();
const cron = require('node-cron');
const { fetchLeads } = require('./apolloSearch');
const { getExistingBusinessNames, appendLeads } = require('./googleSheets');
const config = require('./config');

// ─── LOGGING ────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts} ET] ${msg}`);
}

function logError(msg, err) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const detail = err ? `\n  ${err.message || err}` : '';
  console.error(`[${ts} ET] ERROR: ${msg}${detail}`);
}

// ─── NOTIFICATION ────────────────────────────────────────────────────────────

/**
 * Log a notification to the console (and optionally email).
 * To send real emails, uncomment the nodemailer block and run: npm install nodemailer
 */
function notify(subject, body) {
  console.error('\n' + '═'.repeat(60));
  console.error(`NOTIFICATION → ${config.notificationEmail}`);
  console.error(`Subject: ${subject}`);
  console.error(body);
  console.error('═'.repeat(60) + '\n');

  // ── Optional: real email via nodemailer ───────────────────────────────────
  // Uncomment and configure if you want actual email alerts.
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  // });
  // transporter.sendMail({
  //   from: process.env.EMAIL_USER,
  //   to: config.notificationEmail,
  //   subject,
  //   text: body,
  // }).catch(e => console.error('Failed to send email:', e.message));
}

// ─── MAIN WORKFLOW ────────────────────────────────────────────────────────────

async function runLeadGen() {
  log('─── Lead gen run started ───');
  log(`Target: up to ${config.maxLeadsPerRun} new HVAC leads in SW Michigan`);

  let existingNames;

  // Step 1: Read existing names from the sheet
  try {
    log('Reading existing leads from Google Sheets...');
    existingNames = await getExistingBusinessNames();
    log(`  Found ${existingNames.size} existing businesses (dedup list loaded)`);
  } catch (err) {
    logError('Failed to read Google Sheets', err);
    notify(
      '[Lead Gen] ERROR: Could not read Google Sheets',
      `Failed to read the existing lead list from Google Sheets.\n\n` +
      `Error: ${err.message}\n\n` +
      `Check:\n` +
      `  • GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set correctly\n` +
      `  • The service account has edit access to the sheet\n` +
      `  • Sheet ID: ${config.spreadsheetId}`
    );
    return;
  }

  // Step 2: Fetch new leads from Apollo
  let newLeads;
  try {
    log('Fetching leads from Apollo.io...');
    newLeads = await fetchLeads(existingNames, config.maxLeadsPerRun);
    log(`  Apollo returned ${newLeads.length} new leads (not in sheet, have phone)`);
  } catch (err) {
    logError('Failed to fetch leads from Apollo', err);
    notify(
      '[Lead Gen] ERROR: Apollo.io search failed',
      `The Apollo.io API search failed.\n\n` +
      `Error: ${err.message}\n\n` +
      `Check:\n` +
      `  • APOLLO_API_KEY is set correctly\n` +
      `  • Your Apollo plan includes the People Search API (paid plan required)\n` +
      `  • Upgrade at https://www.apollo.io/pricing`
    );
    return;
  }

  // Step 3: Handle empty results
  if (newLeads.length === 0) {
    log('No new leads found this run. Apollo may have exhausted unique results.');
    log('Consider expanding the city list or industry keywords in config.js');
    notify(
      '[Lead Gen] No new leads found',
      `The lead gen ran successfully but Apollo returned 0 new leads.\n\n` +
      `This can happen when:\n` +
      `  • Apollo has been fully scraped for the current filter set\n` +
      `  • All results are already in the sheet\n\n` +
      `To get more leads:\n` +
      `  • Add more cities to config.js → cities[]\n` +
      `  • Expand industryKeywords\n` +
      `  • Lower the employee range (e.g. up to 50)`
    );
    return;
  }

  // Step 4: Append to Google Sheets
  try {
    log(`Appending ${newLeads.length} leads to Google Sheets...`);
    const count = await appendLeads(newLeads);
    log(`  ✓ ${count} rows added successfully`);

    // Print a summary table to the log
    log('\n  New leads added:');
    newLeads.forEach((lead, i) => {
      log(`  ${String(i + 1).padStart(2)}. ${lead.businessName} (${lead.city}) — ${lead.phone}`);
    });
  } catch (err) {
    logError('Failed to write to Google Sheets', err);
    notify(
      '[Lead Gen] ERROR: Google Sheets write failed',
      `Apollo returned ${newLeads.length} leads but the Google Sheets write failed.\n\n` +
      `Error: ${err.message}\n\n` +
      `Check:\n` +
      `  • The service account still has edit access to the sheet\n` +
      `  • The sheet ID is correct: ${config.spreadsheetId}\n` +
      `  • Column headers match: ${config.columnHeaders.join(' | ')}`
    );
    return;
  }

  log(`─── Run complete: ${newLeads.length} new leads added ───\n`);
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────

log('Apollo HVAC Lead Gen — starting up');
log(`Cron schedule: ${config.cronSchedule} (${config.cronTimezone})`);
log(`Target sheet: https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`);
log('Waiting for next scheduled run...\n');

// Validate the cron expression before scheduling
if (!cron.validate(config.cronSchedule)) {
  console.error(`Invalid cron expression: ${config.cronSchedule}`);
  process.exit(1);
}

// Schedule the job
cron.schedule(config.cronSchedule, runLeadGen, {
  scheduled: true,
  timezone: config.cronTimezone,
});

// Also run immediately on startup if RUN_NOW=true (useful for manual testing)
if (process.env.RUN_NOW === 'true') {
  log('RUN_NOW=true — running immediately...\n');
  runLeadGen().catch((err) => {
    logError('Unhandled error in runLeadGen', err);
    process.exit(1);
  });
}
