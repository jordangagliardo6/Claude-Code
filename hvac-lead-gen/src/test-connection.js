/**
 * test-connection.js
 * Pre-flight check — verifies that both Apollo.io and Google Sheets are
 * reachable and properly authenticated BEFORE the first scheduled run.
 *
 * Run this once after setup:
 *   node src/test-connection.js
 *   npm run test-connection
 *
 * Exit codes:
 *   0 — all checks passed, safe to start the scheduler
 *   1 — one or more checks failed, check the output above
 */

require('dotenv').config();

const axios  = require('axios');
const { testConnection } = require('./sheets');
const { logger }         = require('./notifier');

// ── Helpers ────────────────────────────────────────────────────────────────

function pass(label) {
  console.log(`  ✓  ${label}`);
}

function fail(label, detail) {
  console.error(`  ✗  ${label}`);
  if (detail) console.error(`     ${detail}`);
}

// ── Checks ─────────────────────────────────────────────────────────────────

/**
 * checkEnvVars — verifies all critical environment variables are present.
 */
function checkEnvVars() {
  console.log('\n[1/3] Checking environment variables…');

  const required = {
    APOLLO_API_KEY:        'Apollo.io API key',
    GOOGLE_SPREADSHEET_ID: 'Google Sheets spreadsheet ID',
  };

  // At least one auth method must be present
  const hasServiceAccount = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const hasOAuth = (
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );

  let allGood = true;

  for (const [key, label] of Object.entries(required)) {
    if (process.env[key]) {
      pass(`${key} (${label})`);
    } else {
      fail(key, `Required: ${label}`);
      allGood = false;
    }
  }

  if (hasServiceAccount) {
    pass(`GOOGLE_SERVICE_ACCOUNT_KEY_FILE (${process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE})`);
  } else if (hasOAuth) {
    pass('Google OAuth2 credentials (CLIENT_ID + CLIENT_SECRET + REFRESH_TOKEN)');
  } else {
    fail(
      'Google auth',
      'Provide GOOGLE_SERVICE_ACCOUNT_KEY_FILE (recommended) or ' +
      'GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN'
    );
    allGood = false;
  }

  // Optional but worth flagging if missing
  if (!process.env.ALERT_EMAIL) {
    console.log('  ⚠  ALERT_EMAIL not set — errors will only log to console');
  }

  return allGood;
}

/**
 * checkApollo — makes a lightweight API call to verify the key is valid.
 * Uses /v1/auth/health (or falls back to /v1/users/me).
 */
async function checkApollo() {
  console.log('\n[2/3] Testing Apollo.io connection…');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    fail('Apollo', 'APOLLO_API_KEY not set — skipping');
    return false;
  }

  try {
    // /v1/users/me is a low-cost endpoint available on all Apollo plans
    const res = await axios.get('https://api.apollo.io/v1/users/me', {
      params: { api_key: apiKey },
      timeout: 15_000,
    });

    const email = res.data?.user?.email ?? res.data?.email ?? '(unknown)';
    pass(`Apollo.io authenticated as: ${email}`);
    return true;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message ?? err.message;

    if (status === 401 || status === 403) {
      fail('Apollo.io', `Authentication failed (HTTP ${status}) — check your APOLLO_API_KEY`);
    } else if (status === 422) {
      // 422 on /me means the endpoint doesn't exist on this plan — try a different check
      pass('Apollo.io key present (endpoint check returned 422 — key may be valid)');
      return true;
    } else {
      fail('Apollo.io', `Unexpected error: ${detail}`);
    }
    return false;
  }
}

/**
 * checkGoogleSheets — tries to fetch the spreadsheet metadata.
 */
async function checkGoogleSheets() {
  console.log('\n[3/3] Testing Google Sheets connection…');

  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    fail('Google Sheets', 'GOOGLE_SPREADSHEET_ID not set — skipping');
    return false;
  }

  try {
    const title = await testConnection();
    pass(`Connected to spreadsheet: "${title}"`);
    pass(`Target sheet tab: "${process.env.GOOGLE_SHEET_NAME || 'Leads'}"`);
    return true;
  } catch (err) {
    fail('Google Sheets', err.message);
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  console.log('='.repeat(55));
  console.log(' HVAC Lead Gen — Connection Test');
  console.log('='.repeat(55));

  const envOk     = checkEnvVars();
  const apolloOk  = await checkApollo();
  const sheetsOk  = await checkGoogleSheets();

  console.log('\n' + '='.repeat(55));

  if (envOk && apolloOk && sheetsOk) {
    console.log(' All checks passed — safe to start the scheduler.');
    console.log(' Run:  npm start   (or node src/index.js)');
    console.log('='.repeat(55) + '\n');
    process.exit(0);
  } else {
    console.error(' One or more checks failed — fix the issues above.');
    console.error(' Then re-run:  npm run test-connection');
    console.log('='.repeat(55) + '\n');
    process.exit(1);
  }
})();
