/**
 * setup.js — First-run connection test and configuration helper.
 *
 * Run this before your first scheduled run:
 *   node setup.js
 *
 * This will:
 *   1. Verify your .env file is complete
 *   2. Test the Apollo.io API connection
 *   3. Test the Google Sheets connection
 *   4. Print a step-by-step guide if anything is missing
 */

require('dotenv').config();

const apollo = require('./apollo');
const sheets = require('./sheets');
const fs     = require('fs');
const path   = require('path');

// ANSI color codes for terminal output
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const ok   = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);
const fail = (msg) => console.log(`  ${RED}✗${RESET} ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}!${RESET} ${msg}`);
const info = (msg) => console.log(`  ${CYAN}→${RESET} ${msg}`);
const head = (msg) => console.log(`\n${BOLD}${msg}${RESET}`);

async function main() {
  console.log(`\n${BOLD}${'═'.repeat(58)}${RESET}`);
  console.log(`${BOLD}  HVAC Lead Gen — Setup & Connection Test${RESET}`);
  console.log(`${BOLD}${'═'.repeat(58)}${RESET}`);

  let allGood = true;

  // ─── 1. Check .env file ──────────────────────────────────────────────────
  head('Step 1: Environment Variables');

  const required = {
    APOLLO_API_KEY:              'Apollo.io API key',
    GOOGLE_SHEET_ID:             'Google Spreadsheet ID',
    GOOGLE_SERVICE_ACCOUNT_KEY:  'Path to service account JSON key',
  };
  const optional = {
    GOOGLE_SHEET_TAB: 'Sheet tab name (default: Sheet1)',
    NOTIFY_EMAIL:     'Error notification email',
    SMTP_HOST:        'SMTP host for email alerts',
    SMTP_USER:        'SMTP username',
    SMTP_PASS:        'SMTP password',
  };

  for (const [key, label] of Object.entries(required)) {
    if (process.env[key]) {
      ok(`${key} — set`);
    } else {
      fail(`${key} — MISSING (${label})`);
      allGood = false;
    }
  }
  for (const [key, label] of Object.entries(optional)) {
    if (process.env[key]) {
      ok(`${key} — set (${label})`);
    } else {
      warn(`${key} — not set (${label})`);
    }
  }

  if (!allGood) {
    console.log('\nFix the missing variables in your .env file and re-run setup.js.');
    printSetupGuide();
    process.exit(1);
  }

  // ─── 2. Check service account key file ──────────────────────────────────
  head('Step 2: Google Service Account Key File');

  const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  if (fs.existsSync(keyPath)) {
    try {
      const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      if (key.type === 'service_account') {
        ok(`Key file found: ${keyPath}`);
        ok(`Service account email: ${key.client_email}`);
        info(`Make sure you've shared your spreadsheet with the above email (Editor access).`);
      } else {
        fail(`File exists but is not a service account key (type: ${key.type})`);
        allGood = false;
      }
    } catch {
      fail(`Found file at ${keyPath} but could not parse it as JSON.`);
      allGood = false;
    }
  } else {
    fail(`Service account key not found at: ${keyPath}`);
    allGood = false;
    printServiceAccountGuide();
  }

  if (!allGood) process.exit(1);

  // ─── 3. Test Apollo.io connection ────────────────────────────────────────
  head('Step 3: Apollo.io API Connection');

  try {
    await apollo.testConnection();
    ok('Apollo.io API key is valid and returning results.');
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      fail(`Apollo auth failed (HTTP ${status}). Check your APOLLO_API_KEY.`);
    } else if (status === 429) {
      warn(`Apollo rate limit hit — your key works but you've hit the request cap.`);
    } else {
      fail(`Apollo connection error: ${err.message}`);
    }
    allGood = false;
  }

  // ─── 4. Test Google Sheets connection ────────────────────────────────────
  head('Step 4: Google Sheets Connection');

  try {
    const title = await sheets.testConnection();
    ok(`Connected to spreadsheet: "${title}"`);
    ok(`Sheet ID: ${process.env.GOOGLE_SHEET_ID}`);
  } catch (err) {
    if (err.message?.includes('not found')) {
      fail(`Spreadsheet not found. Check GOOGLE_SHEET_ID.`);
    } else if (err.message?.includes('permission') || err.code === 403) {
      fail(`Permission denied. Share the spreadsheet with the service account email (Editor).`);
    } else {
      fail(`Google Sheets error: ${err.message}`);
    }
    allGood = false;
  }

  // ─── 5. Result ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`);
  if (allGood) {
    console.log(`${GREEN}${BOLD}  ✓ All checks passed! You're ready to go.${RESET}`);
    console.log(`\n  Start the scheduler:         ${CYAN}node index.js${RESET}`);
    console.log(`  Run once immediately:        ${CYAN}node index.js --run-now${RESET}`);
    console.log(`  Schedule (7am ET daily):     ${CYAN}node index.js${RESET}  (keeps process alive)`);
    console.log(`\n  Tip: Use PM2 to run as a background daemon:`);
    console.log(`    ${CYAN}npm install -g pm2${RESET}`);
    console.log(`    ${CYAN}pm2 start index.js --name "hvac-lead-gen"${RESET}`);
    console.log(`    ${CYAN}pm2 save && pm2 startup${RESET}   ← auto-restart on reboot`);
  } else {
    console.log(`${RED}${BOLD}  ✗ Some checks failed. Fix the issues above and re-run setup.js.${RESET}`);
  }
  console.log(`${'─'.repeat(58)}\n`);

  process.exit(allGood ? 0 : 1);
}

// ─── Setup guide helpers ─────────────────────────────────────────────────────

function printSetupGuide() {
  console.log(`
${BOLD}How to create your .env file:${RESET}
  1. Copy the template:    cp .env.example .env
  2. Open .env in a text editor and fill in:
       APOLLO_API_KEY             → apollo.io → Settings → API Keys
       GOOGLE_SHEET_ID            → from your sheet URL (long string between /d/ and /edit)
       GOOGLE_SERVICE_ACCOUNT_KEY → ./credentials/serviceAccountKey.json (see below)
`);
}

function printServiceAccountGuide() {
  console.log(`
${BOLD}How to create a Google Service Account key:${RESET}

  1. Go to https://console.cloud.google.com/
  2. Create a new project (or select an existing one).
  3. Enable APIs:
       • Search "Google Sheets API" → Enable
       • Search "Google Drive API"  → Enable
  4. Create a Service Account:
       IAM & Admin → Service Accounts → + Create Service Account
       Give it any name (e.g. "lead-gen-bot") → Create and Continue → Done
  5. Generate a key:
       Click the service account → Keys tab → Add Key → Create new key → JSON → Create
       A JSON file downloads to your computer.
  6. Move that file into this folder:
       mkdir -p credentials
       mv ~/Downloads/your-key-file.json credentials/serviceAccountKey.json
  7. Share your Google Sheet with the service account email:
       Open your spreadsheet → Share → paste the service account email
       (looks like: lead-gen-bot@your-project.iam.gserviceaccount.com)
       Set access to Editor → Share
`);
}

main().catch((err) => {
  console.error('\n[Fatal]', err.message);
  process.exit(1);
});
