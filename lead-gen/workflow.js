'use strict';

const fs = require('fs');
const path = require('path');
const { fetchLeads } = require('./apollo');
const { appendLeads, verifyConnection } = require('./sheets');
const { sendErrorAlert, sendRunSummary } = require('./mailer');
const { CITIES, MAX_LEADS_PER_RUN } = require('./config');

const LOG_DIR = path.join(__dirname, 'logs');

function writeLog(filename, content) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const filepath = path.join(LOG_DIR, filename);
  fs.appendFileSync(filepath, content + '\n', 'utf8');
}

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  writeLog('run.log', line);
}

/**
 * Main workflow — called by the cron scheduler each morning.
 */
async function runWorkflow() {
  const startedAt = new Date();
  logLine('─'.repeat(60));
  logLine(`Run started — max ${MAX_LEADS_PER_RUN} leads`);
  logLine(`Targeting cities: ${CITIES.join(', ')}`);

  let leads = [];
  let added = 0;
  let skipped = 0;

  // ── Step 1: Fetch leads from Apollo ─────────────────────────────────────────
  try {
    logLine('[Step 1] Searching Apollo.io for HVAC leads...');
    leads = await fetchLeads(CITIES, MAX_LEADS_PER_RUN);
    logLine(`[Step 1] Apollo returned ${leads.length} qualified leads with phone numbers.`);

    if (leads.length === 0) {
      const msg =
        'Apollo returned 0 leads with phone numbers for the current search criteria. ' +
        'This may indicate an API quota limit or that all results lack phone data. ' +
        'Check your APOLLO_API_KEY and your Apollo plan limits.';
      logLine(`[Step 1] WARNING: ${msg}`);
      await sendErrorAlert('Apollo returned 0 leads', msg);
      return;
    }
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    logLine(`[Step 1] ERROR: ${msg}`);
    await sendErrorAlert('Apollo search failed', msg + '\n\nStack:\n' + err.stack);
    return;
  }

  // ── Step 2: Write leads to Google Sheets ─────────────────────────────────────
  try {
    logLine('[Step 2] Appending leads to Google Sheets...');
    const result = await appendLeads(leads);
    added = result.added;
    skipped = result.skipped;
    logLine(`[Step 2] Done. Added: ${added}, Skipped (duplicates): ${skipped}`);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    logLine(`[Step 2] ERROR: ${msg}`);
    await sendErrorAlert(
      'Google Sheets write failed',
      msg + '\n\nLeads that were NOT saved:\n' +
        leads.map((l) => `${l.businessName} — ${l.phone}`).join('\n') +
        '\n\nStack:\n' + err.stack
    );
    return;
  }

  // ── Step 3: Summary ──────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  logLine(`Run complete in ${elapsed}s. Added: ${added} | Skipped: ${skipped} | Total fetched: ${leads.length}`);
  await sendRunSummary({ added, skipped, total: leads.length });
}

/**
 * Verify both integrations before the first scheduled run.
 * Exits with code 1 if anything is misconfigured.
 */
async function verifySetup() {
  console.log('\n' + '═'.repeat(60));
  console.log('  HVAC Lead Gen — Connection Verification');
  console.log('═'.repeat(60) + '\n');

  let allGood = true;

  // Check env vars
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_CREDENTIALS_PATH'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`  ✗ Missing env var: ${key}`);
      allGood = false;
    } else {
      console.log(`  ✓ ${key} is set`);
    }
  }

  // Verify Apollo API key with a minimal search
  console.log('\n[Apollo] Testing API key with a small search...');
  try {
    const axios = require('axios');
    const res = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        api_key: process.env.APOLLO_API_KEY,
        person_locations: ['Kalamazoo, MI'],
        person_titles: ['owner'],
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
    );
    const count = res.data.pagination?.total_entries ?? 0;
    console.log(`  ✓ Apollo connected — total matching contacts in DB: ${count.toLocaleString()}`);
  } catch (err) {
    console.error(`  ✗ Apollo connection failed: ${err.message}`);
    if (err.response?.status === 401) {
      console.error('    → Invalid API key. Double-check APOLLO_API_KEY in your .env');
    }
    allGood = false;
  }

  // Verify Google Sheets
  console.log('\n[Google Sheets] Testing connection...');
  try {
    await verifyConnection();
    console.log('  ✓ Google Sheets connected successfully');
  } catch (err) {
    console.error(`  ✗ Google Sheets connection failed: ${err.message}`);
    allGood = false;
  }

  console.log('\n' + '═'.repeat(60));
  if (allGood) {
    console.log('  ✓ All systems connected — safe to start the scheduler.\n');
    console.log('  Run "npm start" to begin (first automated run at 7:00 AM ET).');
    console.log('  Run "npm run run-now" to trigger an immediate run.\n');
  } else {
    console.error('  ✗ One or more checks failed. Fix the issues above before starting.\n');
    process.exit(1);
  }
}

module.exports = { runWorkflow, verifySetup };
