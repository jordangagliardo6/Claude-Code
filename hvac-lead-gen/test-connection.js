'use strict';

/**
 * test-connection.js — Verify both Apollo.io and Google Sheets are reachable
 * before your first scheduled run.
 *
 *   node test-connection.js
 *
 * A clean run prints two green ✓ lines and exits 0.
 * Any failure prints the reason and exits 1.
 */

require('dotenv').config();
const apollo = require('./src/apollo');
const sheets = require('./src/sheets');

const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const RESET = '\x1b[0m';

function ok(label, message) {
  console.log(`${GREEN}✓${RESET} ${label}: ${message}`);
}

function fail(label, message) {
  console.error(`${RED}✗${RESET} ${label}: ${message}`);
}

(async () => {
  let allOk = true;

  // ── Apollo.io ───────────────────────────────────────────────────────────────
  process.stdout.write('  Testing Apollo.io connection... ');
  try {
    const result = await apollo.testConnection();
    ok('Apollo.io', result.message);
  } catch (err) {
    fail('Apollo.io', err.message);
    allOk = false;
  }

  // ── Google Sheets ───────────────────────────────────────────────────────────
  process.stdout.write('  Testing Google Sheets connection... ');
  try {
    const result = await sheets.testConnection();
    ok('Google Sheets', result.message);
  } catch (err) {
    fail('Google Sheets', err.message);
    allOk = false;
  }

  // ── Result ──────────────────────────────────────────────────────────────────
  console.log('');
  if (allOk) {
    console.log(`${GREEN}All connections verified. You're ready to go!${RESET}`);
    console.log('  Run manually now:   node run-now.js');
    console.log('  Start the cron:     node index.js  (or: npm start)');
    process.exit(0);
  } else {
    console.error(`${RED}One or more connections failed. Fix the errors above before running.${RESET}`);
    process.exit(1);
  }
})();
