// ============================================================
// First-Run Setup & Connection Verification
// Usage: node setup-check.js
// This script:
//   1. Guides you through Google OAuth2 authorization (first run only)
//   2. Tests the Apollo.io API connection
//   3. Tests the Google Sheets read/write connection
//   4. Confirms everything is wired up before the cron starts
// ============================================================

require('dotenv').config();
const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const { getOAuthClient, getAuthUrl, exchangeCode } = require('./auth');
const { searchHvacLeads }                          = require('./apollo');
const { getExistingBusinessNames, ensureHeaderRow } = require('./sheets');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

// ── Step 1: Verify .env exists ────────────────────────────────
function checkEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env file not found.');
    console.error('    Copy .env.example to .env and fill in your credentials:\n');
    console.error('    cp .env.example .env\n');
    process.exit(1);
  }

  const missing = [];
  if (!process.env.APOLLO_API_KEY)        missing.push('APOLLO_API_KEY');
  if (!process.env.GOOGLE_CLIENT_ID)      missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET)  missing.push('GOOGLE_CLIENT_SECRET');
  if (!process.env.GOOGLE_SHEET_ID)       missing.push('GOOGLE_SHEET_ID');

  if (missing.length > 0) {
    console.error(`❌  Missing required values in .env:\n    ${missing.join(', ')}\n`);
    console.error('    Open .env and fill in those values, then re-run setup.\n');
    process.exit(1);
  }

  console.log('✅  .env file found with required keys.\n');
}

// ── Step 2: Google OAuth2 flow ────────────────────────────────
async function setupGoogleAuth() {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('✅  GOOGLE_REFRESH_TOKEN already set — skipping OAuth flow.\n');
    return;
  }

  console.log('─── Google OAuth2 Authorization ───────────────────────────\n');
  console.log('You need to authorize this app to access your Google Sheets.');
  console.log('This is a one-time step. Your refresh token will be printed');
  console.log('so you can add it to your .env file.\n');

  const auth = getOAuthClient();
  const url  = getAuthUrl(auth);

  console.log('1. Open this URL in your browser:\n');
  console.log(`   ${url}\n`);
  console.log('2. Sign in with the Google account that owns the spreadsheet.');
  console.log('3. Click "Allow" to grant Sheets access.');
  console.log('4. Copy the authorization code shown on the confirmation page.\n');

  const code = (await ask('Paste the authorization code here: ')).trim();

  let tokens;
  try {
    tokens = await exchangeCode(auth, code);
  } catch (err) {
    console.error(`\n❌  Failed to exchange code: ${err.message}`);
    console.error('    Make sure you copied the full code and try again.\n');
    rl.close();
    process.exit(1);
  }

  console.log('\n✅  Authorization successful!\n');
  console.log('Add this line to your .env file:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

  // Automatically write it to .env if possible
  try {
    const envPath  = path.join(__dirname, '.env');
    const envText  = fs.readFileSync(envPath, 'utf8');
    if (envText.includes('GOOGLE_REFRESH_TOKEN=')) {
      const updated = envText.replace(
        /GOOGLE_REFRESH_TOKEN=.*/,
        `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
      );
      fs.writeFileSync(envPath, updated);
      process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
      console.log('✅  GOOGLE_REFRESH_TOKEN written to .env automatically.\n');
    }
  } catch (_) {
    console.log('(Could not auto-write to .env — please add it manually.)\n');
  }
}

// ── Step 3: Test Apollo.io ────────────────────────────────────
async function testApollo() {
  console.log('─── Testing Apollo.io API ──────────────────────────────────\n');
  console.log('Searching for HVAC contacts (requesting 3 results as a test)…');

  let leads;
  try {
    leads = await searchHvacLeads(3);
  } catch (err) {
    console.error(`\n❌  Apollo.io connection failed: ${err.message}\n`);
    console.error('    Check your APOLLO_API_KEY in .env.\n');
    return false;
  }

  if (leads.length === 0) {
    console.warn('\n⚠️   Apollo returned 0 results for the test query.');
    console.warn('    This may be normal (all contacts in range already pulled).');
    console.warn('    The API key itself is working.\n');
  } else {
    console.log(`\n✅  Apollo.io connected — sample lead:\n`);
    const l = leads[0];
    console.log(`    Business : ${l.businessName}`);
    console.log(`    Contact  : ${l.firstName} ${l.lastName}`);
    console.log(`    Phone    : ${l.phone}`);
    console.log(`    City     : ${l.city}`);
    console.log(`    Website  : ${l.website || '(none)'}\n`);
  }
  return true;
}

// ── Step 4: Test Google Sheets ────────────────────────────────
async function testSheets() {
  console.log('─── Testing Google Sheets Connection ───────────────────────\n');

  const { getOAuthClient } = require('./auth');
  const auth = getOAuthClient();

  try {
    await ensureHeaderRow(auth);
    const existing = await getExistingBusinessNames(auth);
    console.log(`✅  Google Sheets connected.`);
    console.log(`    Sheet ID : ${process.env.GOOGLE_SHEET_ID}`);
    console.log(`    Tab      : ${process.env.GOOGLE_SHEET_TAB || 'Sheet1'}`);
    console.log(`    Existing leads in sheet: ${existing.length}\n`);
    return true;
  } catch (err) {
    console.error(`\n❌  Google Sheets connection failed: ${err.message}\n`);
    console.error('    Check:');
    console.error('      • GOOGLE_SHEET_ID is correct');
    console.error('      • GOOGLE_SHEET_TAB matches the tab name in your spreadsheet');
    console.error('      • GOOGLE_REFRESH_TOKEN is set (re-run setup to regenerate)\n');
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n=== HVAC Lead Scraper — First-Run Setup ===\n');

  checkEnvFile();
  await setupGoogleAuth();

  const apolloOk = await testApollo();
  const sheetsOk = await testSheets();

  rl.close();

  console.log('─── Summary ────────────────────────────────────────────────\n');
  console.log(`  Apollo.io  : ${apolloOk ? '✅  Connected' : '❌  Failed'}`);
  console.log(`  Google Sheets : ${sheetsOk ? '✅  Connected' : '❌  Failed'}\n`);

  if (apolloOk && sheetsOk) {
    console.log('Everything is connected! Start the scraper with:\n');
    console.log('  node index.js\n');
    console.log('It will run automatically at 7:00 AM Eastern every morning.\n');
  } else {
    console.log('Fix the issues above and run `npm run setup` again.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\nUnexpected error during setup: ${err.message}\n`);
  rl.close();
  process.exit(1);
});
