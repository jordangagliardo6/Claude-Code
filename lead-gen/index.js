// ─── HVAC Lead Generation – Entry Point ───────────────────────────────────────
//
// Usage:
//   node index.js               → start the 7 AM Eastern daily scheduler
//   node index.js --test        → verify Apollo + Google Sheets, then exit
//   node index.js --run-now     → verify connections, run once immediately, then exit
//
// ──────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const cron = require('node-cron');

const { fetchApolloLeads }                       = require('./src/apollo');
const { getExistingBusinessNames, appendLeadsToSheet } = require('./src/sheets');
const { testApolloConnection }                   = require('./src/apollo');
const { testSheetsConnection }                   = require('./src/sheets');
const { config }                                 = require('./src/config');

// ─── Core Workflow ────────────────────────────────────────────────────────────

async function runLeadGenWorkflow() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] Starting lead generation workflow…`);

  try {
    // 1. Load existing business names so we can skip duplicates
    console.log('Fetching existing entries from Google Sheet…');
    const existingNames = await getExistingBusinessNames();
    console.log(`  ${existingNames.size} existing business(es) found.`);

    // 2. Pull leads from Apollo
    console.log('Searching Apollo.io for HVAC leads in Southwest Michigan…');
    const apolloLeads = await fetchApolloLeads(config.apollo.maxLeadsPerRun);
    console.log(`  Apollo returned ${apolloLeads.length} contact(s) with phone numbers.`);

    if (apolloLeads.length === 0) {
      const msg = 'Apollo returned no results. Possible causes: exhausted results for these filters, API quota hit, or network error.';
      console.warn(`[WARNING] ${msg}`);
      await sendNotification('Apollo No Results', msg);
      return;
    }

    // 3. Deduplicate against existing sheet data (match on Business Name)
    const newLeads = apolloLeads.filter(
      lead => !existingNames.has(lead.businessName.toLowerCase().trim())
    );
    console.log(`  After dedup: ${newLeads.length} new lead(s) to add.`);

    if (newLeads.length === 0) {
      console.log('No new leads to add — all Apollo results are already in the sheet.');
      return;
    }

    // 4. Format rows and append to Google Sheet
    const dateAdded = new Date().toLocaleDateString('en-US');
    const rows = newLeads.map(lead => [
      dateAdded,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',   // Called — left blank for manual tracking
      '',   // Notes  — left blank for manual tracking
    ]);

    await appendLeadsToSheet(rows);
    console.log(`✅ Added ${newLeads.length} new lead(s) to Google Sheet.`);

  } catch (err) {
    const msg = `Workflow failed: ${err.message}`;
    console.error(`[ERROR] ${msg}`);
    console.error(err);
    await sendNotification('Lead Gen Workflow Error', msg);
  }
}

// ─── Notification ─────────────────────────────────────────────────────────────

async function sendNotification(subject, message) {
  // Always log to console so cloud/server logs capture it
  console.error(`\n[NOTIFICATION] ${subject}\n${message}\n`);

  // Optional email via SMTP — only fires when env vars are all set
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.NOTIFICATION_EMAIL
  ) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from:    process.env.SMTP_USER,
        to:      process.env.NOTIFICATION_EMAIL,
        subject: `[HVAC Lead Gen] ${subject}`,
        text:    message,
      });
      console.log('Email notification sent.');
    } catch (emailErr) {
      console.error('Failed to send email notification:', emailErr.message);
    }
  }
}

// ─── Connection Test ──────────────────────────────────────────────────────────

async function testConnections() {
  console.log('\n=== Testing Connections ===\n');

  // Apollo
  try {
    await testApolloConnection();
    console.log('✅ Apollo.io        — connected');
  } catch (err) {
    console.error('❌ Apollo.io        — FAILED:', err.message);
    process.exit(1);
  }

  // Google Sheets
  try {
    await testSheetsConnection();
    console.log('✅ Google Sheets    — connected');
  } catch (err) {
    console.error('❌ Google Sheets   — FAILED:', err.message);
    process.exit(1);
  }

  console.log('\n=== All connections verified ===\n');
}

// ─── Entry Points ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--test')) {
  // Verify connections and exit — safe to run before first scheduled run
  testConnections().then(() => {
    console.log('Ready. Run `npm start` to start the daily scheduler, or `npm run run-now` to trigger once.');
    process.exit(0);
  });

} else if (args.includes('--run-now')) {
  // Verify then execute the full workflow once
  testConnections().then(() => runLeadGenWorkflow());

} else {
  // Start the recurring scheduler
  testConnections().then(() => {
    console.log(`Scheduler started. Lead generation will run daily at 7:00 AM Eastern Time.`);
    console.log('Press Ctrl+C to stop.\n');

    cron.schedule(config.cronExpression, runLeadGenWorkflow, {
      timezone: config.timezone,
    });
  });
}
