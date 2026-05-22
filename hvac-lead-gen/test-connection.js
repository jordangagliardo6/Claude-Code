'use strict';

/**
 * Run this BEFORE your first scheduled run:
 *   node test-connection.js
 *
 * It verifies:
 *  ✓ .env file is loaded and required keys are set
 *  ✓ Apollo.io API key is valid
 *  ✓ Google Sheets credentials file exists
 *  ✓ The target spreadsheet is accessible
 *  ✓ Sheet headers are in place (creates them if missing)
 */

require('dotenv').config();

const path  = require('path');
const fs    = require('fs');

async function main() {
  let passed = 0;
  let failed = 0;

  console.log('\n══════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('══════════════════════════════════════════════════\n');

  // ── 1. Environment variables ───────────────────────────────────────────
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
  const optional = ['GOOGLE_SERVICE_ACCOUNT_KEY_FILE', 'NOTIFICATION_EMAIL', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'];

  console.log('1. Environment variables');
  for (const key of required) {
    if (process.env[key]) {
      ok(`  ${key} is set`);
      passed++;
    } else {
      fail(`  ${key} is MISSING — add it to your .env file`);
      failed++;
    }
  }
  for (const key of optional) {
    const val = process.env[key];
    console.log(`   ${val ? '•' : '○'}  ${key} ${val ? '(set)' : '(not set — optional)'}`);
  }

  // ── 2. Google credentials file ─────────────────────────────────────────
  console.log('\n2. Google service account key file');
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'credentials.json';
  const keyPath = path.isAbsolute(keyFile)
    ? keyFile
    : path.join(__dirname, keyFile);

  if (fs.existsSync(keyPath)) {
    ok(`  Found: ${keyPath}`);
    passed++;
    try {
      const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      if (parsed.client_email) {
        ok(`  Service account email: ${parsed.client_email}`);
        console.log(`\n  ⚠️  ACTION NEEDED — share your Google Sheet with:`);
        console.log(`     ${parsed.client_email}`);
        console.log('     (Editor permissions, not just Viewer)\n');
      } else {
        warn('  credentials.json exists but missing "client_email" — is this a valid service account key?');
      }
    } catch {
      warn('  credentials.json exists but could not be parsed as JSON');
    }
  } else {
    fail(`  NOT FOUND: ${keyPath}`);
    console.log('  → Download your service account key from Google Cloud Console');
    console.log('    and save it as credentials.json in the hvac-lead-gen/ folder.');
    failed++;
  }

  // ── 3. Apollo API ──────────────────────────────────────────────────────
  console.log('\n3. Apollo.io API');
  if (process.env.APOLLO_API_KEY) {
    try {
      const { testConnection } = require('./src/apollo');
      await testConnection();
      ok('  Apollo API key accepted');
      passed++;
    } catch (err) {
      fail(`  Apollo connection failed: ${err.message}`);
      failed++;
    }
  } else {
    warn('  Skipped — APOLLO_API_KEY not set');
  }

  // ── 4. Google Sheets ───────────────────────────────────────────────────
  console.log('\n4. Google Sheets');
  if (process.env.GOOGLE_SHEET_ID && fs.existsSync(keyPath)) {
    try {
      const { testConnection, ensureHeaders } = require('./src/sheets');
      const title = await testConnection();
      ok(`  Spreadsheet accessible: "${title}"`);
      passed++;

      await ensureHeaders();
      ok('  Headers verified (created if they were missing)');
      passed++;
    } catch (err) {
      fail(`  Google Sheets connection failed: ${err.message}`);
      if (err.message.includes('403')) {
        console.log('  → Share the spreadsheet with your service account email (see step 2 above).');
      }
      failed++;
    }
  } else {
    warn('  Skipped — GOOGLE_SHEET_ID not set or credentials file missing');
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`  ✅  All ${passed} checks passed — you're ready to run!`);
    console.log('\n  Start the scheduler:  npm start');
    console.log('  Run once right now:   npm run run-now');
  } else {
    console.log(`  ❌  ${failed} check(s) failed, ${passed} passed`);
    console.log('\n  Fix the issues above, then re-run: node test-connection.js');
  }
  console.log('══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

function ok(msg)   { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }

main().catch(err => {
  console.error('Unexpected error in test-connection.js:', err);
  process.exit(1);
});
