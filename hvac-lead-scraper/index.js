/**
 * HVAC Lead Generation — SW Michigan
 *
 * Runs every morning at 7:00 AM Eastern Time.
 * Pulls up to 25 new HVAC owner leads from Apollo.io and appends them
 * to the master Google Sheet, skipping duplicates.
 *
 * First-time setup:
 *   1. Copy .env.example → .env and fill in all keys
 *   2. Run `node auth.js` once to authorize Google Sheets
 *   3. Run `node verify.js` to confirm both connections work
 *   4. Run `node index.js` to start the daily scheduler
 *      OR `node index.js --run-now` to fire immediately for testing
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchHVACLeads } = require('./apollo');
const { getExistingBusinessNames, appendNewLeads } = require('./sheets');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const ALERT_EMAIL = process.env.ALERT_EMAIL || '';

async function runLeadPull() {
  const startTime = new Date().toISOString();
  console.log(`\n[${startTime}] Starting HVAC lead pull...`);

  try {
    console.log('Searching Apollo.io for HVAC owners in SW Michigan...');
    const leads = await searchHVACLeads(MAX_LEADS);
    console.log(`Apollo returned ${leads.length} valid leads (with phone numbers)`);

    if (leads.length === 0) {
      logError('Apollo returned 0 results. Check API key, plan level, or search filters.', null);
      return;
    }

    console.log('Reading existing businesses from Google Sheet...');
    const existingNames = await getExistingBusinessNames();

    const added = await appendNewLeads(leads, existingNames);
    console.log(`\n✓ Done. Added ${added} new leads.`);
    console.log(`  Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit\n`);
  } catch (err) {
    const isPlanLimit = err.message.startsWith('APOLLO_PLAN_LIMIT');
    logError(
      err.message,
      isPlanLimit ? 'HVAC Scraper — Apollo Plan Upgrade Required' : 'HVAC Scraper — Error'
    );
    throw err;
  }
}

function logError(message, subject) {
  const timestamp = new Date().toISOString();
  console.error(`\n[ERROR][${timestamp}] ${subject || 'HVAC Scraper Error'}`);
  console.error(`  ${message}`);
  if (ALERT_EMAIL) console.error(`  Alert would be sent to: ${ALERT_EMAIL}`);
  // Wire up nodemailer/SendGrid here when ready for email alerts
}

// Schedule: 7:00 AM Eastern, every day
cron.schedule(
  '0 7 * * *',
  async () => {
    try {
      await runLeadPull();
    } catch (_) {}
  },
  { timezone: 'America/New_York' }
);

console.log('HVAC lead scraper running. Scheduled for 7:00 AM Eastern daily.');
console.log(`Max leads per run: ${MAX_LEADS}`);
console.log(`Sheet ID: ${process.env.GOOGLE_SHEET_ID || '(not set — check .env)'}`);

if (process.argv.includes('--run-now')) {
  console.log('\n--run-now flag detected. Firing immediately...\n');
  runLeadPull().catch((err) => {
    console.error('Run failed:', err.message);
    process.exit(1);
  });
}
