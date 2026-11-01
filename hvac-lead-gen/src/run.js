/**
 * Core workflow runner — called by the scheduler and by the test script.
 *
 * Flow:
 *  1. Pull up to MAX_LEADS_PER_RUN contacts from Apollo.io
 *  2. Filter to Southwest Michigan / has phone
 *  3. De-duplicate against the Google Sheet
 *  4. Append new rows
 *  5. Log a summary (or send an alert on failure)
 */

require('dotenv').config();

const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendAlert } = require('./notify');

const MAX_LEADS_PER_RUN = 25;

async function run() {
  const apolloKey = process.env.APOLLO_API_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || './token.json';

  // Validate required config
  if (!apolloKey) {
    await sendAlert('Missing config', 'APOLLO_API_KEY is not set. Aborting run.');
    return;
  }
  if (!spreadsheetId) {
    await sendAlert('Missing config', 'GOOGLE_SPREADSHEET_ID is not set. Aborting run.');
    return;
  }

  console.log(`[${new Date().toISOString()}] Starting HVAC lead gen run (max ${MAX_LEADS_PER_RUN} leads)...`);

  // Step 1: Fetch leads from Apollo
  let leads = [];
  try {
    const result = await searchLeads(apolloKey, MAX_LEADS_PER_RUN);
    leads = result.leads;
    console.log(`Apollo returned ${leads.length} qualified leads (total pool: ${result.total})`);
  } catch (err) {
    await sendAlert('Apollo search failed', err.message);
    return;
  }

  if (leads.length === 0) {
    await sendAlert('Apollo returned no results', 'The search returned 0 contacts with phone numbers for Southwest Michigan HVAC. Check filters or API quota.');
    return;
  }

  // Step 2: Append to Google Sheet
  try {
    const appended = await appendLeads(credentialsPath, tokenPath, spreadsheetId, sheetName, leads);
    console.log(`[${new Date().toISOString()}] Run complete. ${appended} new lead(s) added to sheet.`);
  } catch (err) {
    await sendAlert('Google Sheets write failed', err.message);
  }
}

module.exports = { run };

// Allow direct execution: node src/run.js
if (require.main === module) {
  run().catch((err) => {
    console.error('Unhandled error in run():', err);
    process.exit(1);
  });
}
