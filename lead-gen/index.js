/**
 * HVAC Lead Gen — Entry Point
 *
 * CLI flags:
 *   node index.js                Run the scheduler (stays alive, fires at 7 AM ET daily)
 *   node index.js --once         Run the workflow once right now, then exit
 *   node index.js --test         Test Apollo + Google Sheets connections, then exit
 */

require('dotenv').config();
const { runWorkflow, testConnections } = require('./src/workflow');
const { startScheduler } = require('./src/scheduler');
const config = require('./src/config');

function validateEnv() {
  const missing = [];
  if (!config.apollo.apiKey)        missing.push('APOLLO_API_KEY');
  if (!config.sheets.spreadsheetId) missing.push('GOOGLE_SPREADSHEET_ID');

  if (missing.length > 0) {
    console.error('\n  ERROR: Missing required environment variables:');
    missing.forEach((k) => console.error(`    - ${k}`));
    console.error('\n  Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }
}

async function main() {
  validateEnv();

  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    // Connection test only
    await testConnections();
    process.exit(0);
  }

  if (args.includes('--once')) {
    // Single run, no scheduler
    console.log('Running one-time workflow...');
    await runWorkflow();
    process.exit(0);
  }

  // Default: run connection test first, then start the scheduler
  await testConnections();
  startScheduler();

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\nShutting down scheduler...');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
