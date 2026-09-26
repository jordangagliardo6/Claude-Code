/**
 * Main workflow — ties Apollo search to Google Sheets append.
 * Called by the cron scheduler in index.js and directly by setup.js.
 */

const apollo = require('./apollo');
const sheets = require('./sheets');
const config = require('./config');

async function runWorkflow() {
  const startedAt = new Date();
  const bar = '═'.repeat(58);

  console.log(`\n╔${bar}╗`);
  console.log(`║  HVAC Lead Generation Run — ${startedAt.toISOString()}  ║`);
  console.log(`╚${bar}╝\n`);

  const result = {
    success:     false,
    leadsFound:  0,
    leadsAdded:  0,
    error:       null,
    durationSec: 0,
  };

  try {
    // Step 1: Pull enriched leads from Apollo.
    const leads = await apollo.getEnrichedLeads(config.maxLeadsPerRun);
    result.leadsFound = leads.length;

    if (leads.length === 0) {
      console.log('[Workflow] Apollo returned no results for this run');
    } else {
      // Step 2: Dedup and append to Google Sheets.
      result.leadsAdded = await sheets.appendLeads(leads);
    }

    result.success = true;

  } catch (err) {
    result.error = err.message;
    console.error(`\n[Workflow] ⚠ ERROR: ${err.message}`);

    if (err.response) {
      const { status, data } = err.response;
      console.error(`[Workflow]   HTTP ${status}:`, JSON.stringify(data).slice(0, 400));
    }

    await sendErrorNotification(err, startedAt);
  }

  result.durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000);

  console.log(`\n┌${'─'.repeat(40)}`);
  console.log(`│ Result:      ${result.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`│ Leads found: ${result.leadsFound}`);
  console.log(`│ Leads added: ${result.leadsAdded}`);
  console.log(`│ Duration:    ${result.durationSec}s`);
  if (result.error) console.log(`│ Error:       ${result.error}`);
  console.log(`└${'─'.repeat(40)}\n`);

  return result;
}

/**
 * Logs the error and (optionally) sends an email via SMTP.
 * To enable email: install nodemailer, fill in SMTP_* env vars, and
 * uncomment the block below.
 */
async function sendErrorNotification(err, startedAt) {
  const body = [
    'HVAC Lead Workflow — Error Report',
    '==================================',
    `Time:    ${startedAt.toISOString()}`,
    `Error:   ${err.message}`,
    '',
    err.stack,
    '',
    'Run `node setup.js` to verify API connectivity.',
  ].join('\n');

  console.error('\n⚠  ERROR NOTIFICATION (console only — configure SMTP for email):');
  console.error(body);

  /* ── Uncomment to enable email alerts ────────────────────────────────────
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from:    process.env.SMTP_FROM,
    to:      config.notificationEmail,
    subject: `⚠ HVAC Lead Workflow Error — ${startedAt.toLocaleDateString()}`,
    text:    body,
  });
  ──────────────────────────────────────────────────────────────────────── */
}

module.exports = { runWorkflow };
