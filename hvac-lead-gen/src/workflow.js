/**
 * Core lead generation workflow.
 *
 * Steps:
 *   1. Search Apollo.io for HVAC decision-makers in Southwest Michigan
 *   2. Enrich results to fetch phone numbers
 *   3. Normalize and filter (drop contacts with no phone)
 *   4. Deduplicate against the existing Google Sheet
 *   5. Append up to MAX_LEADS_PER_RUN new rows
 *   6. Log results; send alert email on failure
 */

const { searchHVACLeads, enrichLeads, normalizeLead } = require('./apollo');
const { appendLeads } = require('./sheets');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

/**
 * Format today's date as YYYY-MM-DD in Eastern Time.
 */
function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Send a simple console-log error alert.
 * Extend this to send email via nodemailer if ALERT_EMAIL is set.
 */
async function sendAlert(subject, body) {
  const alertEmail = process.env.ALERT_EMAIL;
  console.error(`\n⚠️  ALERT: ${subject}`);
  console.error(body);

  if (alertEmail) {
    // To enable email alerts, install nodemailer and configure a Gmail App Password:
    //   npm install nodemailer
    // Then uncomment and fill in the block below:
    //
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({
    //   service: 'gmail',
    //   auth: { user: alertEmail, pass: process.env.GMAIL_APP_PASSWORD },
    // });
    // await transporter.sendMail({
    //   from: alertEmail,
    //   to: alertEmail,
    //   subject: `[HVAC Lead Gen] ${subject}`,
    //   text: body,
    // });
    console.error(`(Email alert to ${alertEmail} — configure nodemailer to enable)`);
  }
}

/**
 * Main workflow entry point. Called by the cron scheduler in index.js.
 */
async function runWorkflow() {
  const date = todayET();
  console.log(`\n[${new Date().toISOString()}] Starting HVAC lead workflow — date: ${date}`);

  try {
    // ── Step 1: Search Apollo for people ─────────────────────────────────────
    console.log('Searching Apollo.io for HVAC contacts in Southwest Michigan...');
    let people = [];
    try {
      people = await searchHVACLeads(1, MAX_LEADS * 2); // fetch extra to allow for drops
      console.log(`Apollo returned ${people.length} raw results`);
    } catch (apolloErr) {
      // Apollo paid-plan gate or network error — log clearly and bail
      await sendAlert('Apollo search failed', apolloErr.message);
      throw apolloErr;
    }

    if (!people.length) {
      await sendAlert(
        'Apollo returned 0 results',
        `Date: ${date}\nNo HVAC leads returned. Check your Apollo filters or API key.`
      );
      return;
    }

    // ── Step 2: Enrich to get phone numbers ───────────────────────────────────
    const personIds = people.map((p) => p.id).filter(Boolean);
    let enriched = [];
    try {
      console.log(`Enriching ${personIds.length} contacts for phone numbers...`);
      enriched = await enrichLeads(personIds);
      console.log(`Enrichment returned ${enriched.length} results`);
    } catch (enrichErr) {
      await sendAlert('Apollo enrichment failed', enrichErr.message);
      throw enrichErr;
    }

    // ── Step 3: Normalize and filter no-phone contacts ────────────────────────
    const leads = enriched
      .map(normalizeLead)
      .filter(Boolean) // remove null (no phone)
      .slice(0, MAX_LEADS);

    console.log(`${leads.length} leads with phone numbers (after filtering)`);

    if (!leads.length) {
      await sendAlert(
        'No leads with phone numbers',
        `Date: ${date}\nApollo returned contacts but none had a phone number. ` +
        `Check direct dial credits or consider upgrading your Apollo plan.`
      );
      return;
    }

    // ── Step 4 & 5: Dedup + append to Google Sheet ───────────────────────────
    console.log(`Appending up to ${MAX_LEADS} new leads to Google Sheet...`);
    let result;
    try {
      result = await appendLeads(leads, date);
    } catch (sheetsErr) {
      await sendAlert('Google Sheets write failed', sheetsErr.message);
      throw sheetsErr;
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    console.log(
      `✅ Workflow complete — added: ${result.added}, skipped (duplicates): ${result.skipped}`
    );
  } catch (err) {
    console.error(`❌ Workflow error: ${err.message}`);
    throw err;
  }
}

module.exports = { runWorkflow };
