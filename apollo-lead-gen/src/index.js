// ─────────────────────────────────────────────────────────────────────────────
// index.js — Entry point
//
// Usage:
//   node src/index.js             → start the scheduler (runs every 7 AM ET)
//   node src/index.js --test      → verify Apollo + Google Sheets connections
//   node src/index.js --run-now   → run one fetch immediately (no scheduler)
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const apollo = require('./apolloService');
const sheets = require('./sheetsService');
const { sendErrorAlert } = require('./notifier');

// ── Validate required env vars on startup ────────────────────────────────────
function assertEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH', 'GOOGLE_SPREADSHEET_ID'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nCopy .env.example → .env and fill in the values.`);
  }
}

// ── Connection test (--test flag) ─────────────────────────────────────────────
async function runConnectionTest() {
  console.log('\n=== Apollo Lead Gen — Connection Test ===\n');

  process.stdout.write('1. Testing Apollo API key... ');
  try {
    const { email, plan } = await apollo.testConnection();
    console.log(`OK\n   Account: ${email}\n   Plan: ${plan || 'unknown'}`);
    if (!plan || plan === 'free') {
      console.warn('\n   ⚠️  NOTE: People Search + phone reveal requires Apollo Professional or higher.');
      console.warn('   Upgrade at https://www.apollo.io/pricing\n');
    }
  } catch (err) {
    console.log(`FAILED\n   ${err.message}`);
    process.exit(1);
  }

  process.stdout.write('2. Testing Google Sheets access... ');
  try {
    const title = await sheets.testConnection();
    console.log(`OK\n   Spreadsheet: "${title}"`);
  } catch (err) {
    console.log(`FAILED\n   ${err.message}`);
    process.exit(1);
  }

  console.log('\n✓ Both connections verified. Safe to start the scheduler.\n');
  console.log(`  Spreadsheet ID : ${process.env.GOOGLE_SPREADSHEET_ID}`);
  console.log(`  Schedule       : ${config.CRON_SCHEDULE} (server local time → set server TZ=America/New_York)`);
  console.log(`  Max leads/run  : ${config.MAX_LEADS_PER_RUN}`);
  console.log(`  Target cities  : ${config.TARGET_LOCATIONS.slice(0, 4).join(', ')} …\n`);
}

// ── One lead-generation run ───────────────────────────────────────────────────
async function runLeadGen() {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n[${ts} ET] Starting lead gen run...`);

  let leads;
  try {
    leads = await apollo.fetchLeads();
    console.log(`  Apollo returned ${leads.length} qualified leads with phone numbers.`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.response?.data?.error || err.message}`;
    await sendErrorAlert('Apollo search failed', msg);
    return;
  }

  if (!leads.length) {
    console.log('  No new leads returned from Apollo this run. Nothing written to sheet.');
    await sendErrorAlert(
      'Apollo returned 0 results',
      'The People Search returned no qualified leads. Check your Apollo plan, API key, and search filters in src/config.js.'
    );
    return;
  }

  let result;
  try {
    result = await sheets.appendLeads(leads);
    console.log(`  Sheet update: +${result.added} added, ${result.skipped} skipped (duplicates).`);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    await sendErrorAlert('Google Sheets write failed', msg);
    return;
  }

  const ts2 = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts2} ET] Run complete. ✓\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  assertEnv();

  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    await runConnectionTest();
    process.exit(0);
  }

  if (args.includes('--run-now')) {
    await runLeadGen();
    process.exit(0);
  }

  // Default: start the scheduler
  console.log(`\nApollo Lead Gen scheduler started.`);
  console.log(`Schedule: "${config.CRON_SCHEDULE}" (set TZ=America/New_York on your server)`);
  console.log(`Next run at 7:00 AM Eastern Time.\n`);

  cron.schedule(config.CRON_SCHEDULE, runLeadGen, {
    timezone: 'America/New_York',
  });
})();
