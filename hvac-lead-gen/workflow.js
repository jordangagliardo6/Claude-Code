// ─────────────────────────────────────────────────────────────────────────────
// workflow.js — Core lead generation logic
// Orchestrates: Apollo search → deduplication → Google Sheets write.
// Called by the cron scheduler in index.js or directly via `npm run run-once`.
// ─────────────────────────────────────────────────────────────────────────────

const { searchLeads }                                          = require('./apollo');
const { getExistingBusinessNames, appendLeads, ensureHeaders } = require('./sheets');
const config                                                   = require('./config');

const DIVIDER = '─'.repeat(60);

/**
 * Run one complete lead generation cycle:
 *   1. Ensure the sheet has headers
 *   2. Load existing business names (dedup key)
 *   3. Search Apollo for new HVAC leads
 *   4. Filter out already-seen businesses
 *   5. Write up to maxLeadsPerRun new rows to Google Sheets
 *
 * Any unrecoverable error is caught, logged, and forwarded to notifyError().
 */
async function runWorkflow() {
  const runTime = new Date().toLocaleString('en-US', {
    weekday  : 'long',
    month    : 'short',
    day      : 'numeric',
    year     : 'numeric',
    hour     : 'numeric',
    minute   : '2-digit',
    timeZone : 'America/New_York',
  });

  console.log(`\n${DIVIDER}`);
  console.log(`[Workflow] Run started: ${runTime} (ET)`);
  console.log(DIVIDER);

  try {
    // ── Step 1: Headers ─────────────────────────────────────────────────────
    console.log('[Workflow] Step 1/4 — Checking Google Sheet headers...');
    await ensureHeaders();

    // ── Step 2: Load existing business names for dedup ───────────────────────
    console.log('[Workflow] Step 2/4 — Loading existing leads for deduplication...');
    const existingNames = await getExistingBusinessNames();
    console.log(`  ${existingNames.size} businesses already in the sheet`);

    // ── Step 3: Search Apollo ────────────────────────────────────────────────
    console.log(`[Workflow] Step 3/4 — Searching Apollo.io (max ${config.maxLeadsPerRun} leads)...`);
    const rawLeads = await searchLeads();
    console.log(`  Apollo returned ${rawLeads.length} valid leads across all cities`);

    if (rawLeads.length === 0) {
      const msg =
        '[Workflow] Apollo returned 0 leads. Possible causes:\n' +
        '  • Monthly API quota exhausted (check your Apollo plan)\n' +
        '  • Filters are too narrow — try broadening city list or industries\n' +
        '  • APOLLO_API_KEY is valid but lacks search permissions';
      console.warn(msg);
      notifyError(msg);
      return;
    }

    // ── Step 4: Deduplicate and write ────────────────────────────────────────
    console.log('[Workflow] Step 4/4 — Deduplicating and writing to Google Sheet...');

    const newLeads = rawLeads.filter(
      (lead) => !existingNames.has(lead.businessName.toLowerCase().trim())
    );

    const skipped = rawLeads.length - newLeads.length;
    if (skipped > 0) {
      console.log(`  Skipped ${skipped} duplicate(s) already in the sheet`);
    }

    if (newLeads.length === 0) {
      console.log('  No new leads to add — all returned businesses are already on file.');
      console.log(DIVIDER + '\n');
      return;
    }

    // Respect the per-run cap
    const toWrite = newLeads.slice(0, config.maxLeadsPerRun);
    const written = await appendLeads(toWrite);

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log(DIVIDER);
    console.log(`[Workflow] DONE — ${written} new lead(s) added to the sheet`);
    if (newLeads.length > toWrite.length) {
      const leftOver = newLeads.length - toWrite.length;
      console.log(`  (${leftOver} additional lead(s) held back due to maxLeadsPerRun=${config.maxLeadsPerRun} limit)`);
    }
    console.log(DIVIDER + '\n');

  } catch (err) {
    const errMsg = `[Workflow] FATAL ERROR: ${err.message}\n\nStack trace:\n${err.stack}`;
    console.error('\n' + errMsg);
    notifyError(errMsg);
  }
}

/**
 * Log an error alert and optionally send an email notification.
 *
 * To enable real email alerts:
 *   1. npm install nodemailer
 *   2. Add SMTP env vars to .env (see commented example below)
 *   3. Uncomment the nodemailer block
 *
 * @param {string} message - Human-readable error description
 */
function notifyError(message) {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  console.error('\n╔══════════════════════════════════════════════════════════╗');
  console.error('║  ERROR ALERT — Manual check required                     ║');
  console.error('╚══════════════════════════════════════════════════════════╝');
  console.error(`Time: ${timestamp} ET`);
  console.error(message);
  console.error('─'.repeat(60));

  if (config.notificationEmail) {
    console.error(`→ Would send email alert to: ${config.notificationEmail}`);

    // ── Uncomment to enable SMTP email alerts ──────────────────────────────
    // Requires: npm install nodemailer
    // Add to .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    //
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({
    //   host: process.env.SMTP_HOST,
    //   port: parseInt(process.env.SMTP_PORT || '587'),
    //   secure: false,
    //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // });
    // transporter.sendMail({
    //   from   : process.env.SMTP_USER,
    //   to     : config.notificationEmail,
    //   subject: `HVAC Lead Gen Error — ${new Date().toDateString()}`,
    //   text   : message,
    // }).catch((e) => console.error('[Email] Failed to send alert:', e.message));
  }
}

module.exports = { runWorkflow };
