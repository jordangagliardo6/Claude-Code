'use strict';

/**
 * HVAC Lead Generation — SW Michigan
 * ────────────────────────────────────────────────────────────────────────────
 * Searches Apollo.io for HVAC / plumbing / mechanical owners in Southwest
 * Michigan, filters out businesses already in the Google Sheet, and appends
 * up to MAX_LEADS_PER_RUN new rows — running automatically every morning at
 * 7:00 AM Eastern Time via node-cron.
 *
 * FIRST-TIME SETUP (run these once before the scheduled job takes over):
 *
 *   1. Copy .env.example to .env and fill in APOLLO_API_KEY and GMAIL credentials.
 *
 *   2. Set up Google OAuth2:
 *        a. Go to https://console.cloud.google.com
 *        b. Create a project → Enable "Google Sheets API"
 *        c. Credentials → Create OAuth 2.0 Client ID → Application type: Desktop
 *        d. Download JSON → save as  hvac-leads/credentials/google-oauth-client.json
 *        e. Run:  npm run authorize
 *           A browser URL is printed. Open it, approve, paste the code back.
 *           Your token is saved to  hvac-leads/credentials/google-token.json
 *
 *   3. Verify both connections are live:
 *        npm run verify
 *
 *   4. Run one batch right now (does not wait for 7am):
 *        npm run now
 *
 *   5. Start the scheduler (keeps running in the background):
 *        npm start
 *      Use  pm2 start index.js --name hvac-leads  to keep it alive after logout.
 *
 * CUSTOMIZING:
 *   • City list → edit TARGET_CITIES in  lib/apollo.js
 *   • Column order → edit appendLeads() in  lib/sheets.js
 *   • Leads per run → set MAX_LEADS_PER_RUN in .env  (default: 25)
 *   • Schedule → change the cron expression below  (default: '0 7 * * *')
 * ────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHvacLeads, verifyApolloConnection } = require('./lib/apollo');
const { getExistingBusinessNames, appendLeads, authorize, verifySheetsConnection } = require('./lib/sheets');
const { log, notifyError } = require('./lib/notify');

const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ── Core workflow ──────────────────────────────────────────────────────────

async function runLeadGeneration() {
  log('─── Lead generation run started ───');

  try {
    // Step 1: load existing business names to prevent duplicates
    const existingNames = await getExistingBusinessNames();
    log(`Sheet has ${existingNames.size} existing businesses`);

    // Step 2: fetch candidates from Apollo (request extra to absorb dupes)
    const fetchLimit = MAX_LEADS_PER_RUN * 3;
    const candidates = await searchHvacLeads(fetchLimit);
    log(`Apollo returned ${candidates.length} candidates with phone numbers`);

    if (candidates.length === 0) {
      const msg = 'Apollo returned no results for SW Michigan HVAC search. ' +
        'Check your APOLLO_API_KEY and account quota at developer.apollo.io.';
      log(msg, 'error');
      await notifyError(msg);
      return;
    }

    // Step 3: filter out businesses already in the sheet
    const newLeads = candidates.filter(
      lead => !existingNames.has((lead.businessName || '').toLowerCase().trim())
    );
    log(`${newLeads.length} new (non-duplicate) leads after filtering`);

    if (newLeads.length === 0) {
      log('All Apollo results are already in the sheet — nothing to add today');
      return;
    }

    // Step 4: cap at MAX_LEADS_PER_RUN
    const toAdd = newLeads.slice(0, MAX_LEADS_PER_RUN);

    // Step 5: append to sheet
    await appendLeads(toAdd);

    log(`✓ Added ${toAdd.length} new lead(s) to the Google Sheet`);
    log('─── Run complete ───');
  } catch (err) {
    const msg = `Lead generation run failed: ${err.message}\n${err.stack || ''}`;
    log(msg, 'error');
    await notifyError(msg);
  }
}

// ── CLI modes ──────────────────────────────────────────────────────────────

async function runVerify() {
  log('Verifying connections...');

  let apolloOk = false;
  let sheetsOk = false;

  try {
    await verifyApolloConnection();
    log('✓ Apollo.io connection OK');
    apolloOk = true;
  } catch (err) {
    log(`✗ Apollo.io connection FAILED: ${err.message}`, 'error');
  }

  try {
    const header = await verifySheetsConnection();
    log(`✓ Google Sheets connection OK — header: [${header.join(', ')}]`);
    sheetsOk = true;
  } catch (err) {
    log(`✗ Google Sheets connection FAILED: ${err.message}`, 'error');
  }

  if (apolloOk && sheetsOk) {
    log('\n Both connections verified. You are ready to run  npm start  or  npm run now.');
    process.exit(0);
  } else {
    log('\n One or more connections failed. Fix the errors above before starting the scheduler.');
    process.exit(1);
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--authorize')) {
  authorize().catch(err => {
    log(err.message, 'error');
    process.exit(1);
  });
} else if (args.includes('--verify')) {
  runVerify();
} else if (args.includes('--now')) {
  runLeadGeneration().then(() => process.exit(0));
} else {
  // Default: start the cron scheduler
  // '0 7 * * *'  = 7:00 AM every day in the timezone below
  cron.schedule('0 7 * * *', () => {
    runLeadGeneration();
  }, {
    scheduled: true,
    timezone: 'America/New_York',
  });

  log('Scheduler started — next run at 7:00 AM Eastern Time');
  log(`Max leads per run: ${MAX_LEADS_PER_RUN}`);
  log('Run  node index.js --now  to trigger a run immediately');
  log('Run  node index.js --verify  to check both API connections');
}
