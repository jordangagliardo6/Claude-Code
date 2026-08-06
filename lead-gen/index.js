/**
 * HVAC Lead Generation Workflow
 * ==============================
 * Searches Apollo.io for HVAC company owners in Southwest Michigan and
 * appends new contacts (with phone numbers) to a Google Sheets spreadsheet.
 *
 * Usage:
 *   node index.js          — run once immediately (skips scheduler)
 *   node index.js --cron   — start the scheduled service (runs daily at 7 AM ET)
 *   node index.js --test   — verify Apollo and Google Sheets connections only
 */

require('dotenv').config();

const cron = require('node-cron');
const config = require('./config');
const { fetchLeads, personToRow } = require('./apollo');
const { getExistingBusinessNames, appendLeads, testConnection } = require('./sheets');

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

function validateEnv() {
  const missing = [];
  if (!process.env.APOLLO_API_KEY) missing.push('APOLLO_API_KEY');
  const hasServiceAccount =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!hasServiceAccount) missing.push('GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE');

  if (missing.length) {
    throw new Error(`Missing required environment variables:\n  ${missing.join('\n  ')}\nCopy .env.example to .env and fill in the values.`);
  }
}

// --------------------------------------------------------------------------
// Connection test — run with: node index.js --test
// --------------------------------------------------------------------------

async function runConnectionTest() {
  console.log('\n=== Connection Test ===\n');

  // 1. Apollo
  console.log('[Test] Checking Apollo.io API key...');
  try {
    const https = require('https');
    await new Promise((resolve, reject) => {
      const body = JSON.stringify({ per_page: 1, page: 1 });
      const req = https.request({
        hostname: 'api.apollo.io',
        path: '/api/v1/mixed_people/api_search',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Api-Key': process.env.APOLLO_API_KEY,
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log('[Test] Apollo.io ✓  (API key is valid, endpoint reachable)');
            resolve();
          } else if (res.statusCode === 422 || res.statusCode === 400) {
            // Valid key, just an empty query — still a success
            console.log('[Test] Apollo.io ✓  (API key is valid)');
            resolve();
          } else {
            reject(new Error(`Apollo returned ${res.statusCode}: ${parsed.message || parsed.error}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error('[Test] Apollo.io ✗  ', err.message);
    process.exit(1);
  }

  // 2. Google Sheets
  console.log('[Test] Checking Google Sheets connection...');
  try {
    const title = await testConnection(config);
    console.log(`[Test] Google Sheets ✓  (Connected to: "${title}")`);
  } catch (err) {
    console.error('[Test] Google Sheets ✗  ', err.message);
    process.exit(1);
  }

  console.log('\n✓ Both services connected. You are ready to run the workflow.\n');
  console.log(`  Spreadsheet: https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`);
  console.log(`  Schedule:    ${config.cronSchedule}  (7:00 AM Eastern)`);
  console.log(`  Max leads:   ${config.maxLeadsPerRun} per run\n`);
}

// --------------------------------------------------------------------------
// Core lead generation run
// --------------------------------------------------------------------------

async function runLeadGen() {
  const runAt = new Date().toISOString();
  console.log(`\n[${runAt}] Starting lead generation run...`);

  try {
    // 1. Fetch leads from Apollo
    const rawLeads = await fetchLeads(config, process.env.APOLLO_API_KEY);

    if (!rawLeads.length) {
      console.log('[Run] Apollo returned no results for this run. Nothing to add.');
      logError('Apollo returned 0 results', null);
      return;
    }

    // 2. Read existing business names from the sheet
    const existing = await getExistingBusinessNames(config);

    // 3. Convert leads to row format and filter duplicates
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });

    const newRows = [];
    const skipped = [];

    for (const person of rawLeads) {
      const row = personToRow(person, today);
      const name = row['Business Name'].trim().toLowerCase();

      if (!name) {
        skipped.push('(no business name)');
        continue;
      }

      if (existing.has(name)) {
        skipped.push(row['Business Name']);
        continue;
      }

      // Mark as seen so we don't add the same company twice within this batch
      existing.add(name);
      newRows.push(row);

      // Respect the per-run cap
      if (newRows.length >= config.maxLeadsPerRun) break;
    }

    if (skipped.length) {
      console.log(`[Run] Skipped ${skipped.length} duplicate(s): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`);
    }

    // 4. Append to the spreadsheet
    const added = await appendLeads(newRows, config);

    console.log(`[Run] Complete. Added ${added} new lead(s) this run.`);
  } catch (err) {
    console.error('[Run] ERROR:', err.message);
    logError(err.message, err);
    throw err; // re-throw so the cron job can log it
  }
}

// --------------------------------------------------------------------------
// Simple error logger (writes to lead-gen-errors.log in same directory)
// --------------------------------------------------------------------------

function logError(message, err) {
  const fs = require('fs');
  const path = require('path');
  const logFile = path.join(__dirname, 'lead-gen-errors.log');
  const entry = `[${new Date().toISOString()}] ${message}${err ? '\n' + err.stack : ''}\n\n`;
  fs.appendFileSync(logFile, entry);
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

(async () => {
  const args = process.argv.slice(2);

  try {
    validateEnv();
  } catch (err) {
    console.error('\n[Error]', err.message, '\n');
    process.exit(1);
  }

  if (args.includes('--test')) {
    await runConnectionTest();
    return;
  }

  if (args.includes('--cron')) {
    console.log(`[Scheduler] Starting. Cron: "${config.cronSchedule}" (7 AM Eastern).`);
    console.log('[Scheduler] First run will happen at the next scheduled time.');
    console.log('[Scheduler] Press Ctrl+C to stop.\n');

    cron.schedule(config.cronSchedule, async () => {
      try {
        await runLeadGen();
      } catch (err) {
        // Error already logged inside runLeadGen — don't crash the scheduler
        console.error('[Scheduler] Run failed — see lead-gen-errors.log for details.');
      }
    }, {
      timezone: 'America/New_York',
    });

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\n[Scheduler] Stopped.');
      process.exit(0);
    });

    return;
  }

  // Default: run once immediately
  await runLeadGen();
})();
