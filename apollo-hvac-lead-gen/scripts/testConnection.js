// Confirms Apollo and Google Sheets are both reachable before you trust the
// scheduler. Run with: npm run test-connection

const config = require('../config');
const apollo = require('../src/apolloClient');
const sheets = require('../src/googleSheets');

async function main() {
  let ok = true;

  console.log('Checking Apollo.io connection...');
  try {
    const people = await apollo.searchPeople(config.targetCities[0]);
    console.log(`  OK -- Apollo responded (${people.length} candidates for ${config.targetCities[0]}).`);
  } catch (error) {
    ok = false;
    console.error('  FAILED:', error.message);
  }

  console.log('Checking Google Sheets connection...');
  try {
    if (!config.googleSheetId) throw new Error('GOOGLE_SHEET_ID is not set in .env');
    const header = await sheets.verifyConnection();
    console.log(`  OK -- connected to sheet, header row: [${header.join(', ')}]`);

    const expected = config.sheetColumns.join(', ');
    const actual = header.join(', ');
    if (actual !== expected) {
      console.warn(
        `  WARNING: header row does not match config.sheetColumns.\n` +
          `    Expected: ${expected}\n` +
          `    Found:    ${actual}\n` +
          '  Update row 1 of the sheet (or config.js) so they match exactly.'
      );
    }
  } catch (error) {
    ok = false;
    console.error('  FAILED:', error.message);
  }

  console.log(ok ? '\nAll connections OK. Safe to start the scheduler (npm start).' : '\nFix the errors above before starting the scheduler.');
  process.exit(ok ? 0 : 1);
}

main();
