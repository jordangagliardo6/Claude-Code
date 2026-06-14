// Verifies both API connections before the first scheduled run.
//
//   node test-connection.js
//
require('dotenv').config();
const { testApolloConnection } = require('./src/apollo');
const { testSheetsConnection } = require('./src/sheets');

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   HVAC Lead Generator — API Check   ║');
  console.log('╚══════════════════════════════════════╝\n');

  console.log('1. Testing Apollo.io...');
  const apolloOk = await testApolloConnection();

  console.log('\n2. Testing Google Sheets...');
  const sheetsOk = await testSheetsConnection();

  console.log('\n──────────────────────────────────────');

  if (apolloOk && sheetsOk) {
    console.log('✅  All connections verified.');
    console.log('    Run "node run-now.js" to pull your first batch of leads.');
    console.log('    Run "node index.js" to start the 7am daily scheduler.\n');
    process.exit(0);
  } else {
    console.log('❌  One or more connections failed.');
    console.log('    Fix the errors above, then run this check again.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error during connection test:', err.message);
  process.exit(1);
});
