/**
 * setup.js – First-run connectivity checker and OAuth2 authorizer.
 *
 * Run this BEFORE starting the scheduler to confirm both Apollo and Google
 * Sheets are configured correctly.
 *
 *   node setup.js
 *
 * What it does:
 *   1. Checks that all required environment variables are set
 *   2. Pings Apollo.io with your API key to confirm access
 *   3. Connects to your Google Spreadsheet and reads its title
 *   4. If using OAuth2 (no service-account.json), opens a browser to authorize
 *      and saves token.json for future runs
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const { google } = require('googleapis');
const config = require('./config');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function pass(label) { console.log(`  ✓  ${label}`); }
function fail(label) { console.error(`  ✗  ${label}`); }
function info(label) { console.log(`  →  ${label}`); }

// ── Step 1: Env var check ─────────────────────────────────────────────────────

function checkEnvVars() {
  console.log('\n── Step 1: Environment Variables ───────────────────────────────');
  let ok = true;

  if (process.env.APOLLO_API_KEY) {
    pass('APOLLO_API_KEY is set');
  } else {
    fail('APOLLO_API_KEY is missing – add it to your .env file');
    ok = false;
  }

  if (process.env.GOOGLE_SPREADSHEET_ID) {
    pass(`GOOGLE_SPREADSHEET_ID is set (${process.env.GOOGLE_SPREADSHEET_ID.slice(0, 10)}…)`);
  } else {
    fail('GOOGLE_SPREADSHEET_ID is missing – add it to your .env file');
    ok = false;
  }

  const saPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json');
  const credPath = path.resolve(process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './credentials.json');

  if (fs.existsSync(saPath)) {
    pass(`service-account.json found at ${saPath}`);
  } else if (fs.existsSync(credPath)) {
    info(`credentials.json found at ${credPath} → will use OAuth2 flow`);
  } else {
    fail('No Google credentials found. Provide service-account.json OR credentials.json');
    ok = false;
  }

  return ok;
}

// ── Step 2: Apollo.io ping ────────────────────────────────────────────────────

async function checkApollo() {
  console.log('\n── Step 2: Apollo.io Connectivity ──────────────────────────────');
  try {
    // Use the account info endpoint – lightweight, confirms key validity
    const res = await axios.get(`${config.apollo.baseUrl}/auth/health`, {
      headers: { 'x-api-key': config.apollo.apiKey, 'Cache-Control': 'no-cache' },
      timeout: 15_000,
    });
    if (res.status === 200) {
      pass('Apollo.io API key is valid and reachable');
    }
  } catch (err) {
    if (err.response && err.response.status === 401) {
      fail('Apollo.io returned 401 – check your APOLLO_API_KEY');
    } else if (err.response && err.response.status === 403) {
      fail('Apollo.io returned 403 – your plan may not allow API access');
    } else {
      // Some Apollo endpoints return 404 for health checks – try a minimal search instead
      try {
        const res2 = await axios.post(
          `${config.apollo.baseUrl}/mixed_people/search`,
          { per_page: 1, page: 1, q_keywords: 'HVAC' },
          { headers: { 'x-api-key': config.apollo.apiKey, 'Content-Type': 'application/json' }, timeout: 15_000 }
        );
        if (res2.data.people !== undefined) {
          pass('Apollo.io API key is valid (search endpoint responded)');
        }
      } catch (err2) {
        fail(`Apollo.io check failed: ${err2.message}`);
        if (err2.response) info(`Response: ${JSON.stringify(err2.response.data)}`);
      }
    }
  }
}

// ── Step 3: Google Sheets check / OAuth2 flow ─────────────────────────────────

async function checkGoogleSheets() {
  console.log('\n── Step 3: Google Sheets Connectivity ───────────────────────────');

  const { testConnection } = require('./sheets');

  try {
    const title = await testConnection();
    pass(`Connected to spreadsheet: "${title}"`);
    pass(`Sheet tab "${config.sheets.sheetName}" will be used`);
  } catch (err) {
    if (err.message.includes('OAuth2 token not found')) {
      info('No token.json found – starting OAuth2 authorization flow...');
      await runOAuthFlow();
      // Re-test after authorization
      try {
        const title = await testConnection();
        pass(`Connected to spreadsheet: "${title}"`);
      } catch (err2) {
        fail(`Still cannot connect after OAuth: ${err2.message}`);
      }
    } else {
      fail(`Google Sheets connection failed: ${err.message}`);
      if (err.message.includes('not found')) {
        info('Make sure you shared the spreadsheet with the service account email (Editor access)');
      }
    }
  }
}

async function runOAuthFlow() {
  const credPath = path.resolve(process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './credentials.json');
  const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = raw.installed || raw.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

  console.log('\n  Open this URL in your browser to authorize Google access:\n');
  console.log(`  ${authUrl}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) => {
    rl.question('  Paste the authorization code here: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync('./token.json', JSON.stringify(tokens));
  pass('token.json saved – OAuth2 authorization complete');
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   HVAC Lead Scraper – First-Run Setup Check     ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const envOk = checkEnvVars();
  if (!envOk) {
    console.log('\n✗  Fix the missing environment variables above, then re-run `node setup.js`.\n');
    process.exit(1);
  }

  await checkApollo();
  await checkGoogleSheets();

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log('  If all checks passed, you are ready to run:');
  console.log('');
  console.log('    npm run run-now     → run once immediately (good first test)');
  console.log('    npm start           → start the scheduler (7am ET daily)');
  console.log('');
})();
