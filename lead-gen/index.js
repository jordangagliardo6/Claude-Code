// ─── HVAC Lead Generation Scheduler ─────────────────────────────────────────
// Runs every morning at 7:00 AM Eastern.
// Pulls up to 25 new HVAC leads from Apollo.io and appends them to Google Sheets.
//
// Start: node index.js   (or: npm start)
// Stop:  Ctrl+C
// ────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const cron = require('node-cron');
const { fetchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendAlert } = require('./notify');
const config = require('./config');

// Validate required environment variables at startup
function validateEnv() {
  const required = ['APOLLO_API_KEY', 'SPREADSHEET_ID'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nCopy .env.example to .env and fill in your values.`);
  }
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const fs = require('fs');
  if (!fs.existsSync(credPath)) {
    throw new Error(`Google credentials file not found at: ${credPath}\nSee SETUP.md for instructions.`);
  }
}

async function runLeadGeneration() {
  const runId = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Run started: ${runId}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // Fetch leads from Apollo
    console.log('→ Searching Apollo.io for HVAC leads in Southwest Michigan...');
    const leads = await fetchLeads(config);

    if (!leads.length) {
      const msg = 'Apollo returned 0 leads with phone numbers for today\'s search.';
      console.warn(`⚠ ${msg}`);
      await sendAlert('No leads found', new Error(msg), config);
      return;
    }

    console.log(`✓ Apollo returned ${leads.length} leads with phone numbers`);

    // Write to Google Sheets
    console.log('→ Appending to Google Sheets...');
    const { added, skipped } = await appendLeads(leads, config);

    console.log(`✓ Done — Added: ${added} new | Skipped (duplicates): ${skipped}`);
    console.log(`  Sheet: https://docs.google.com/spreadsheets/d/${config.sheets.spreadsheetId}`);

  } catch (err) {
    console.error(`✗ Run failed: ${err.message}`);

    // Determine the failure type for a more useful alert subject
    const isApolloError = err.message.toLowerCase().includes('apollo');
    const subject = isApolloError ? 'Apollo API error' : 'Google Sheets write failed';

    await sendAlert(subject, err, config);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

validateEnv();

// Schedule daily at 7:00 AM Eastern
cron.schedule(config.schedule, runLeadGeneration, {
  timezone: config.timezone,
});

console.log('HVAC Lead Gen scheduler started.');
console.log(`Schedule: daily at 7:00 AM Eastern (${config.schedule})`);
console.log(`Cities: ${config.cities.join(', ')}`);
console.log(`Target: https://docs.google.com/spreadsheets/d/${config.sheets.spreadsheetId}`);
console.log('\nKeep this process running (e.g. via pm2 or a background terminal).');
console.log('Press Ctrl+C to stop.\n');
