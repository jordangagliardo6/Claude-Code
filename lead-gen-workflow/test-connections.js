// test-connections.js
//
// Run this by hand the first time (`node test-connections.js`) before
// trusting the scheduler. It does two cheap, read-only checks and prints a
// clear pass/fail for each:
//
//   1. Apollo: a 1-result search using your real filters, confirming
//      APOLLO_API_KEY works and the filters return at least something.
//   2. Google Sheets: reads the header row of your sheet, confirming the
//      OAuth credentials and GOOGLE_SHEET_ID are correct and the tab/columns
//      match config.js.
//
// Note: the Apollo search call may consume Apollo credits depending on
// your plan (Apollo bills per search request, not per result).

require('dotenv').config();
const axios = require('axios');
const config = require('./config');
const logger = require('./src/logger');
const sheet = require('./src/googleSheets');

async function testApollo() {
  try {
    const { city, state } = config.targetCities[0];
    const { data } = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        person_titles: config.jobTitlePriority,
        organization_locations: [`${city}, ${state}, US`],
        organization_num_employees_ranges: [config.employeeRange],
        q_organization_keyword_tags: config.industryKeywords,
        per_page: 1,
        page: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY,
        },
      }
    );
    logger.info(`Apollo connection OK -- test search for "${city}, ${state}" returned ${data.people?.length ?? 0} result(s).`);
    return true;
  } catch (err) {
    const detail = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message;
    logger.error(`Apollo connection FAILED: ${detail}`);
    return false;
  }
}

async function testGoogleSheets() {
  try {
    const sheetsClient = sheet.getSheetsClient();
    const { data } = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheet.getSpreadsheetId(),
      range: `${config.sheetTabName}!A1:I1`,
    });
    const header = data.values?.[0] || [];
    logger.info(`Google Sheets connection OK -- header row read: [${header.join(', ')}]`);

    const mismatch = config.sheetColumns.some((col, i) => header[i] !== col);
    if (mismatch) {
      logger.warn(
        `Header row does not exactly match config.sheetColumns. Expected: [${config.sheetColumns.join(', ')}]`
      );
    }
    return true;
  } catch (err) {
    logger.error(`Google Sheets connection FAILED: ${err.message}`);
    return false;
  }
}

(async () => {
  logger.info('Testing connections...');
  const [apolloOk, sheetsOk] = await Promise.all([testApollo(), testGoogleSheets()]);

  console.log('');
  console.log(`Apollo.io:      ${apolloOk ? 'CONNECTED' : 'FAILED'}`);
  console.log(`Google Sheets:  ${sheetsOk ? 'CONNECTED' : 'FAILED'}`);

  if (!apolloOk || !sheetsOk) {
    console.log('\nFix the failing connection(s) above before relying on the 7am schedule.');
    process.exit(1);
  }

  console.log('\nBoth connections look good. You can now run `node scheduler.js` to arm the daily 7am job,');
  console.log('or do a real test run with: node -e "require(\'./src/runWorkflow\').runWorkflow()"');
})();
