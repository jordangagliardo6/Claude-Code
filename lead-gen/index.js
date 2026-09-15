/**
 * HVAC Lead Generation — Main Entry Point
 *
 * Scheduled to run every morning at 7:00 AM Eastern Time.
 * Pulls up to MAX_LEADS_PER_RUN new leads from Apollo.io and appends them
 * to the configured Google Sheet, skipping any business already in the sheet.
 *
 * Usage:
 *   node index.js             — start the scheduler (runs until you stop it)
 *   node index.js --run-now   — run once immediately, then exit
 *   npm run run-now           — same as above via npm script
 */

require('dotenv').config();

const cron           = require('node-cron');
const { searchLeads } = require('./apollo');
const { appendLeadsToSheet } = require('./sheets');

const MAX_LEADS     = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || '';

// ─── Core workflow ────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const started = new Date();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${started.toISOString()}] HVAC Lead Gen — starting run`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // Step 1 — Pull leads from Apollo
    console.log(`\nStep 1: Searching Apollo.io (up to ${MAX_LEADS} leads)...`);
    const leads = await searchLeads(MAX_LEADS);

    if (leads.length === 0) {
      const msg =
        'Apollo returned 0 results matching our filters. ' +
        'This may mean: (a) your API key is on a free plan, ' +
        '(b) the search filters returned no matches today, or ' +
        '(c) the API key is invalid. Check APOLLO_API_KEY in .env.';
      console.warn(`\nWARNING: ${msg}`);
      logError('Apollo returned 0 results', msg);
      return;
    }

    console.log(`Found ${leads.length} candidate lead(s) from Apollo.`);
    leads.forEach(l => console.log(`  · ${l.businessName} — ${l.city} — ${l.phone}`));

    // Step 2 — Write to Google Sheets
    console.log('\nStep 2: Appending to Google Sheet...');
    const added = await appendLeadsToSheet(leads);

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nRun complete in ${elapsed}s. Added ${added} new lead(s).`);

  } catch (err) {
    logError('Lead generation run failed', err.message);
    console.error('\nFull error:', err.stack || err.message);
  }
}

// ─── Error logging ────────────────────────────────────────────────────────────

function logError(label, detail) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ERROR — ${label}: ${detail}`;
  console.error(`\n${msg}`);

  // TODO: swap this for an email/SMS alert if you add nodemailer or Twilio
  // Example (nodemailer):
  //   transporter.sendMail({ to: NOTIFICATION_EMAIL, subject: label, text: detail })
  if (NOTIFICATION_EMAIL) {
    console.error(`(Notification email would go to ${NOTIFICATION_EMAIL} — wire up a mailer to activate)`);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

// Schedule: 7:03 AM Eastern every day
// Using :03 instead of :00 to avoid the top-of-hour congestion spike on shared services
const CRON_EXPRESSION = '3 7 * * *';
const TIMEZONE        = 'America/New_York';

cron.schedule(CRON_EXPRESSION, runLeadGeneration, { timezone: TIMEZONE });

console.log('HVAC Lead Generation scheduler is running.');
console.log(`Scheduled: daily at 7:03 AM Eastern Time  [cron: "${CRON_EXPRESSION}"]`);
console.log(`Target sheet: ${process.env.GOOGLE_SPREADSHEET_ID || '(GOOGLE_SPREADSHEET_ID not set)'}`);
console.log('Press Ctrl+C to stop.\n');

// ─── Immediate run (--run-now flag) ───────────────────────────────────────────

if (process.argv.includes('--run-now')) {
  console.log('--run-now flag detected. Executing immediately...');
  runLeadGeneration().then(() => {
    console.log('\nImmediate run finished. Scheduler is still active — Ctrl+C to exit.');
  });
}
