/**
 * Connection tester — verify both APIs before the first scheduled run.
 *
 * Usage:  npm run test-connection   (or: node test-connection.js)
 *
 * Checks:
 *   1. APOLLO_API_KEY is set and reachable
 *   2. Google Sheets credentials load correctly
 *   3. SPREADSHEET_ID is accessible and headers exist
 */

require('dotenv').config();

const axios = require('axios');
const { ensureHeaders, getExistingBusinessNames } = require('./src/sheets');

const APOLLO_BASE = 'https://api.apollo.io/v1';

async function checkApollo() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return { ok: false, detail: 'APOLLO_API_KEY is not set in .env' };

  try {
    // A minimal people search to verify the key and quota
    const res = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      { api_key: key, per_page: 1, page: 1 },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
    );

    const total = res.data.pagination?.total_entries ?? '?';
    return { ok: true, detail: `Authenticated (${total} total records in Apollo database)` };
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const body = JSON.stringify(err.response.data || {}).slice(0, 300);
      if (status === 401 || status === 403) {
        return { ok: false, detail: `Invalid API key (HTTP ${status})` };
      }
      return { ok: false, detail: `HTTP ${status}: ${body}` };
    }
    return { ok: false, detail: err.message };
  }
}

async function checkSheets() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    return { ok: false, detail: 'SPREADSHEET_ID is not set in .env' };
  }

  try {
    await ensureHeaders();
    const existing = await getExistingBusinessNames();
    return {
      ok: true,
      detail: `Connected — spreadsheet has ${existing.size} existing lead(s)`,
    };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      HVAC Lead Gen — Connection Test     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const checks = [
    { label: 'Apollo.io API',   fn: checkApollo },
    { label: 'Google Sheets',   fn: checkSheets },
  ];

  let allOk = true;

  for (const { label, fn } of checks) {
    process.stdout.write(`  ${label.padEnd(20)} `);
    const { ok, detail } = await fn();
    const icon = ok ? '✓' : '✗';
    console.log(`${icon}  ${detail}`);
    if (!ok) allOk = false;
  }

  console.log('\n──────────────────────────────────────────');

  if (allOk) {
    console.log('  All connections OK — you\'re ready to go!\n');
    console.log('  Start the scheduler:   npm start');
    console.log('  Run one cycle now:     npm run run-now');
  } else {
    console.log('  ✗  Fix the issues above before starting the scheduler.');
    console.log('\n  See SETUP.md for step-by-step instructions.');
    process.exitCode = 1;
  }

  console.log('──────────────────────────────────────────\n');
})();
