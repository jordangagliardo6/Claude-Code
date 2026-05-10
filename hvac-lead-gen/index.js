/**
 * HVAC Lead Generation Workflow
 * ──────────────────────────────
 * Pulls HVAC decision-maker contacts from Apollo.io and appends new leads
 * to a Google Sheet, running automatically every morning at 7 AM ET.
 *
 * Usage:
 *   node index.js              — start the scheduler (runs daily at 7 AM ET)
 *   node index.js --verify-only — test API connections and exit
 *   node index.js --run-now    — run the workflow once immediately, then exit
 *
 * First-time setup: see README.md
 */

require('dotenv').config();

const logger = require('./src/logger');
const apollo = require('./src/apollo');
const sheets = require('./src/sheets');
const { runWorkflow } = require('./src/workflow');
const { startScheduler } = require('./src/scheduler');

// ── Env validation ─────────────────────────────────────────────────────────────

function validateEnv() {
  const required = {
    APOLLO_API_KEY: 'Your Apollo.io API key — found in Apollo → Settings → Integrations → API',
    GOOGLE_SPREADSHEET_ID: 'The ID from your Google Sheet URL: .../spreadsheets/d/<ID>/edit',
  };

  const missing = Object.entries(required).filter(([key]) => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables:');
    missing.forEach(([key, hint]) => logger.error(`  ${key}  →  ${hint}`));
    logger.error('\nCopy .env.example to .env and fill in the values, then retry.');
    process.exit(1);
  }
}

// ── Connection verification ────────────────────────────────────────────────────

async function verifyConnections() {
  logger.info('\nVerifying API connections before starting...\n');

  // Run both checks in parallel to save time
  const [apolloOk, sheetsOk] = await Promise.all([
    apollo.verify(),
    sheets.verify(),
  ]);

  console.log(''); // blank line for readability

  if (!apolloOk && !sheetsOk) {
    logger.error('Both Apollo and Google Sheets connections failed. Check the errors above.');
    process.exit(1);
  }
  if (!apolloOk) {
    logger.error('Apollo connection failed. Check your APOLLO_API_KEY in .env.');
    process.exit(1);
  }
  if (!sheetsOk) {
    logger.error(
      'Google Sheets connection failed. Check your credentials.json and GOOGLE_SPREADSHEET_ID.'
    );
    process.exit(1);
  }

  logger.success('All connections verified — ready to run\n');
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  validateEnv();

  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify-only');
  const runNow = args.includes('--run-now');

  // Always verify first so the user knows immediately if credentials are wrong
  await verifyConnections();

  if (verifyOnly) {
    logger.info('--verify-only mode — connections confirmed, exiting.');
    return;
  }

  if (runNow) {
    logger.info('--run-now flag detected — executing workflow immediately\n');
    const result = await runWorkflow();
    logger.info(`\nResult: ${JSON.stringify(result, null, 2)}`);
    return;
  }

  // Default: start the long-running scheduler
  startScheduler();
}

main().catch(err => {
  logger.error('Fatal uncaught error', err);
  process.exit(1);
});
