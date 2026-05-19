/**
 * Entry point — registers the 7am Eastern cron job and wires Apollo + Sheets together.
 *
 * Start the scheduler:   npm start
 * Trigger immediately:   npm run run:now
 * Test connections only: npm run test:connection
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHVACLeads } = require('./apollo');
const { appendLeads }     = require('./sheets');
const logger              = require('./logger');

const MAX_LEADS    = parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10);
const SHEET_ID     = process.env.SPREADSHEET_ID;
const SHEET_NAME   = process.env.SHEET_NAME ?? 'Sheet1';
const ALERT_EMAIL  = process.env.ALERT_EMAIL;

// ─────────────────────────────────────────────────────────────────────────────

async function runWorkflow() {
  logger.info('════════════════════════════════════════════════════════════════');
  logger.info('Lead generation workflow — run started');

  if (!SHEET_ID) {
    notifyError('SPREADSHEET_ID is not set. Aborting run.');
    return;
  }

  try {
    const leads = await searchHVACLeads(MAX_LEADS);

    if (leads.length === 0) {
      notifyError('Apollo returned 0 phone-verified leads for this run. Check filters or try again later.');
      return;
    }

    const added = await appendLeads(SHEET_ID, leads, SHEET_NAME);

    logger.info(`Run complete — ${added} new lead(s) added out of ${leads.length} fetched`);
    logger.info('════════════════════════════════════════════════════════════════');
  } catch (err) {
    const msg = `Workflow error: ${err.message}`;
    logger.error(msg);
    if (err.stack) logger.error(err.stack);
    notifyError(msg);
  }
}

/**
 * Log a loud alert to the console and write it to the log file.
 *
 * To receive email alerts, install nodemailer (`npm install nodemailer`),
 * configure a transport below, and uncomment the sendMail block.
 */
function notifyError(message) {
  const banner = '⚠️  LEAD GEN ALERT';
  const border = '═'.repeat(60);
  logger.error(`${border}`);
  logger.error(`${banner}: ${message}`);
  logger.error(`${border}`);

  // ── Email alerts (optional) ──────────────────────────────────────────────
  // Uncomment and configure to receive email notifications on failures.
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',                      // or 'smtp', 'sendgrid', etc.
  //   auth: { user: ALERT_EMAIL, pass: process.env.EMAIL_PASSWORD },
  // });
  // transporter.sendMail({
  //   from: ALERT_EMAIL,
  //   to:   ALERT_EMAIL,
  //   subject: 'Lead Gen Workflow Alert',
  //   text:    message,
  // }).catch((e) => logger.error(`Failed to send alert email: ${e.message}`));
  // ────────────────────────────────────────────────────────────────────────
}

// ── Cron scheduler ───────────────────────────────────────────────────────────
// Fires every day at 07:00 Eastern Time.
// node-cron v3 supports the `timezone` option natively — no TZ env var needed,
// but setting TZ=America/New_York in .env also keeps log timestamps consistent.
cron.schedule('0 7 * * *', () => {
  logger.info('Cron triggered: starting scheduled lead generation run');
  runWorkflow();
}, {
  timezone: 'America/New_York',
  scheduled: true,
});

logger.info('Scheduler is live. Next run at 07:00 AM Eastern Time.');
logger.info('Keep this process running (e.g. with pm2 or screen) for the cron to fire.');

// Export so run-now.js and test-connection.js can invoke directly
module.exports = { runWorkflow };
