/**
 * workflow.js — Main workflow logic
 *
 * Orchestrates one full run:
 *   1. Pull leads from Apollo.io
 *   2. Append non-duplicate leads to Google Sheets
 *   3. Log results or errors
 */

const path = require('path');
const fs = require('fs');
const { searchHvacLeads } = require('./apollo');
const { getAuthClient, appendLeads } = require('./sheets');

/**
 * Appends a timestamped line to the run log file.
 */
function logToFile(message) {
  const logDir = path.resolve(__dirname, '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `run-${new Date().toISOString().slice(0, 10)}.log`);
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logFile, line);
}

/**
 * Runs the complete lead generation workflow once.
 *
 * @param {object} config - Runtime configuration
 * @param {string} config.apolloApiKey
 * @param {string} config.sheetId
 * @param {string} config.sheetTab
 * @param {number} config.maxLeads
 * @param {string} config.credentialsPath
 * @param {string} config.tokenPath
 */
async function runWorkflow(config) {
  const {
    apolloApiKey,
    sheetId,
    sheetTab,
    maxLeads,
    credentialsPath,
    tokenPath,
  } = config;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Workflow] Run started at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log(`${'─'.repeat(60)}`);
  logToFile('Run started');

  // ── Step 1: Fetch leads from Apollo ──────────────────────────
  let leads;
  try {
    console.log(`[Workflow] Searching Apollo.io for up to ${maxLeads} HVAC leads in SW Michigan…`);
    leads = await searchHvacLeads(apolloApiKey, maxLeads);
    console.log(`[Workflow] Apollo returned ${leads.length} qualified leads.`);
    logToFile(`Apollo returned ${leads.length} leads`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    console.error(`[Workflow] ERROR — ${msg}`);
    logToFile(`ERROR — ${msg}`);
    throw new Error(msg); // re-throw so the scheduler can notify
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 results. Check your API key and search parameters.';
    console.warn(`[Workflow] WARNING — ${msg}`);
    logToFile(`WARNING — ${msg}`);
    throw new Error(msg);
  }

  // ── Step 2: Write to Google Sheets ───────────────────────────
  let result;
  try {
    console.log('[Workflow] Connecting to Google Sheets…');
    const auth = await getAuthClient(credentialsPath, tokenPath);
    result = await appendLeads(auth, sheetId, sheetTab, leads);
    logToFile(`Sheet updated — added: ${result.added}, skipped: ${result.skipped}`);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    console.error(`[Workflow] ERROR — ${msg}`);
    logToFile(`ERROR — ${msg}`);
    throw new Error(msg);
  }

  // ── Step 3: Summary ──────────────────────────────────────────
  console.log(`\n[Workflow] Run complete.`);
  console.log(`  ✓ Added   : ${result.added} new leads`);
  console.log(`  ↷ Skipped : ${result.skipped} duplicates`);
  console.log(`${'─'.repeat(60)}\n`);
  logToFile(`Run complete — added: ${result.added}, skipped: ${result.skipped}`);

  return result;
}

module.exports = { runWorkflow };
