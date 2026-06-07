/**
 * Core workflow: Apollo search → dedup → Google Sheets append.
 * Called by both the cron scheduler (index.js) and the one-shot test (run-now.js).
 */

const { fetchLeads } = require('./apollo');
const {
  getAuthClient,
  ensureHeaders,
  getExistingBusinessNames,
  appendLeads,
} = require('./sheets');
const { sendErrorAlert } = require('./notify');

async function run() {
  const {
    APOLLO_API_KEY,
    GOOGLE_SHEET_ID,
    GOOGLE_SHEET_TAB = 'Leads',
    GOOGLE_SERVICE_ACCOUNT_KEY = './credentials/service-account.json',
    MAX_LEADS_PER_RUN = '25',
  } = process.env;

  // Validate required env vars before doing any API work
  if (!APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is missing from your .env file.');
  }
  if (!GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is missing from your .env file.');
  }

  const maxLeads = parseInt(MAX_LEADS_PER_RUN, 10) || 25;
  const divider = '─'.repeat(60);

  console.log(`\n${divider}`);
  console.log(
    `HVAC Lead Gen  |  ${new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'short',
    })} ET`
  );
  console.log(`Sheet tab: "${GOOGLE_SHEET_TAB}"  |  Max leads this run: ${maxLeads}`);
  console.log(`${divider}\n`);

  // ── Step 1: Connect to Google Sheets ──────────────────────────
  let auth;
  try {
    auth = getAuthClient(GOOGLE_SERVICE_ACCOUNT_KEY);
    await ensureHeaders(auth, GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB);
    console.log('[Sheets] Connected ✓');
  } catch (err) {
    await sendErrorAlert('Google Sheets connection failed.', err);
    throw err;
  }

  // ── Step 2: Load existing business names for duplicate check ──
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(auth, GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB);
    console.log(`[Sheets] ${existingNames.size} existing business name(s) loaded.\n`);
  } catch (err) {
    await sendErrorAlert('Failed to read existing leads from Google Sheets.', err);
    throw err;
  }

  // ── Step 3: Pull leads from Apollo ────────────────────────────
  // We request more than maxLeads so that after dedup we still hit the cap.
  let rawLeads;
  try {
    rawLeads = await fetchLeads(APOLLO_API_KEY, maxLeads * 3);
  } catch (err) {
    await sendErrorAlert('Apollo.io lead search failed — check your API key and plan limits.', err);
    throw err;
  }

  if (rawLeads.length === 0) {
    const msg =
      'Apollo returned 0 results with phone numbers. ' +
      'This may mean the city/industry filters need broadening, or your plan lacks phone credits.';
    await sendErrorAlert(msg, null);
    console.log(`[Runner] ${msg}`);
    return;
  }

  // ── Step 4: Filter out duplicates ─────────────────────────────
  const newLeads = rawLeads.filter(lead => {
    if (!lead.businessName) return false;
    return !existingNames.has(lead.businessName.toLowerCase());
  });

  console.log(
    `\n[Dedup] ${rawLeads.length} fetched → ${newLeads.length} new ` +
    `(${rawLeads.length - newLeads.length} duplicate(s) skipped).`
  );

  if (newLeads.length === 0) {
    console.log('[Runner] Nothing new to add — all results already exist in the sheet.');
    return;
  }

  // Cap at the configured limit
  const leadsToAdd = newLeads.slice(0, maxLeads);

  // ── Step 5: Write to Google Sheets ────────────────────────────
  let addedCount;
  try {
    addedCount = await appendLeads(auth, GOOGLE_SHEET_ID, leadsToAdd, GOOGLE_SHEET_TAB);
  } catch (err) {
    await sendErrorAlert('Google Sheets write failed — leads were fetched but not saved.', err);
    throw err;
  }

  console.log(`\n${divider}`);
  console.log(`✓ Run complete — ${addedCount} lead(s) added to "${GOOGLE_SHEET_TAB}".`);
  console.log(`${divider}\n`);
}

module.exports = { run };
