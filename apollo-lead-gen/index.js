require('dotenv').config();
const cron = require('node-cron');
const { runLeadGeneration } = require('./src/runner');

// ──────────────────────────────────────────────────────────────────────────────
// Entry point — runs in two modes:
//   node index.js         → start the daily 7 AM ET cron scheduler
//   node index.js --test  → single dry run now (no sheet writes, no credits used)
// ──────────────────────────────────────────────────────────────────────────────

const isTestMode = process.argv.includes('--test');

if (isTestMode) {
  console.log('=== TEST MODE — dry run, no sheet writes, no Apollo credits used ===');
  runLeadGeneration({ dryRun: true }).catch(err => {
    console.error('Test run failed:', err.message);
    process.exit(1);
  });
} else {
  // Validate required env vars before starting the scheduler
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }

  console.log('Apollo lead generation scheduler started.');
  console.log('Scheduled: 7:00 AM Eastern Time, every day.');
  console.log(`Max leads per run: ${process.env.MAX_LEADS_PER_RUN || 25}`);

  // node-cron v3 supports native timezone scheduling.
  // TZ="America/New_York" handles both EST and EDT automatically.
  cron.schedule('0 7 * * *', async () => {
    console.log(`\n[${new Date().toISOString()}] Starting scheduled lead generation run...`);
    try {
      await runLeadGeneration({ dryRun: false });
    } catch (err) {
      console.error('Scheduled run error:', err.message);
    }
  }, {
    timezone: 'America/New_York',
  });
}
