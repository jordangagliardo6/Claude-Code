/**
 * HVAC Lead Generation — main entry point
 *
 * Usage:
 *   node index.js            → starts the scheduler (runs daily at 7 AM ET)
 *   node index.js --run-now  → runs a single fetch immediately, then exits
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const config = require('./config');

// ── Core workflow ─────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const startTime = new Date().toISOString();
  console.log(`\n[${startTime}] Starting lead generation run...`);

  let apolloContacts = [];
  let sheetResult = { appended: 0, skipped: 0 };

  // ── Step 1: Fetch leads from Apollo ──────────────────────────────────────
  try {
    const { contacts, totalCount } = await searchLeads(1);
    apolloContacts = contacts;
    console.log(`Apollo search complete. Found ${contacts.length} contacts with phones (${totalCount} total matches).`);

    if (contacts.length === 0) {
      logError('Apollo returned 0 contacts with phone numbers. No leads added this run.');
      return;
    }
  } catch (err) {
    logError(`Apollo fetch failed: ${err.message}`);
    return; // abort — no point writing to sheets if we have no data
  }

  // ── Step 2: Write to Google Sheets ───────────────────────────────────────
  try {
    sheetResult = await appendLeads(apolloContacts);
    console.log(`Sheets update complete. Appended: ${sheetResult.appended}, Skipped (duplicates): ${sheetResult.skipped}`);
  } catch (err) {
    logError(`Google Sheets write failed: ${err.message}`);
    return;
  }

  // ── Step 3: Summary ──────────────────────────────────────────────────────
  const endTime = new Date().toISOString();
  console.log(`[${endTime}] Run finished. New leads added: ${sheetResult.appended}`);
}

// ── Error logging / notification ─────────────────────────────────────────────

function logError(message) {
  const timestamp = new Date().toISOString();
  const fullMessage = `[ERROR ${timestamp}] ${message}`;

  console.error(fullMessage);

  // Console-based alert — swap this for nodemailer/SendGrid if you want email.
  console.error(
    `\n  ACTION NEEDED: Lead gen workflow encountered an error.\n` +
    `  Check the log above and fix before the next scheduled run.\n` +
    `  Alert would be sent to: ${config.ALERT_EMAIL}\n`
  );

  // Optionally write to a log file for persistent error history
  try {
    const fs = require('fs');
    const logPath = require('path').join(__dirname, 'error.log');
    fs.appendFileSync(logPath, fullMessage + '\n');
  } catch {
    // Non-fatal — if we can't write the log file, just keep going
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────

function startScheduler() {
  console.log(
    `Scheduler started. Lead generation will run at ${config.CRON_SCHEDULE} (${config.CRON_TIMEZONE}).\n` +
    `Pass --run-now to trigger an immediate run instead.\n`
  );

  const task = cron.schedule(config.CRON_SCHEDULE, runLeadGeneration, {
    timezone: config.CRON_TIMEZONE,
    scheduled: true,
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down scheduler...');
    task.stop();
    process.exit(0);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  runLeadGeneration().then(() => process.exit(0)).catch(err => {
    logError(err.message);
    process.exit(1);
  });
} else {
  startScheduler();
}
