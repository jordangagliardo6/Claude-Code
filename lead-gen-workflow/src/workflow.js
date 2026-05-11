/**
 * Main workflow: search Apollo → deduplicate → append to Google Sheets.
 *
 * Called by the scheduler in index.js on every scheduled run,
 * and directly when running with --test for a one-off execution.
 */

const fs = require('fs');
const path = require('path');
const { searchHVACLeads, extractLeadData } = require('./apollo');
const { appendLeads, getExistingBusinessNames, ensureHeaderRow } = require('./sheets');

const ERROR_LOG = path.join(__dirname, '..', 'error.log');

async function runWorkflow() {
  const startTime = new Date();
  console.log(`\n[${ startTime.toISOString() }] ─── Lead Generation Workflow Starting ───`);

  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

  try {
    // 1. Ensure spreadsheet has a header row before anything else
    await ensureHeaderRow();

    // 2. Fetch all existing business names for duplicate checking
    console.log('Reading existing leads from Google Sheets...');
    const existingNames = await getExistingBusinessNames();
    console.log(`  ${existingNames.size} existing leads found in spreadsheet.`);

    // 3. Search Apollo — fetch more than MAX_LEADS so we have buffer for duplicates/no-phone
    const fetchCount = Math.min(maxLeads * 3, 100); // Apollo max per_page is 100
    console.log(`Searching Apollo.io for HVAC leads (fetching up to ${fetchCount} candidates)...`);

    let apolloData;
    try {
      apolloData = await searchHVACLeads(1, fetchCount);
    } catch (err) {
      const msg = buildApolloErrorMessage(err);
      await handleError(msg);
      return { success: false, error: msg };
    }

    const rawContacts = apolloData.people || apolloData.contacts || [];
    console.log(`  Apollo returned ${rawContacts.length} raw contact(s).`);

    if (!rawContacts.length) {
      const msg = 'Apollo returned 0 results. The search criteria may need adjustment or the API quota is exhausted.';
      await handleError(msg);
      return { success: false, error: msg };
    }

    // 4. Extract, validate, and deduplicate leads
    const newLeads = [];
    let skippedNoPhone = 0;
    let skippedDuplicate = 0;

    for (const person of rawContacts) {
      if (newLeads.length >= maxLeads) break;

      const lead = extractLeadData(person);

      if (!lead) {
        skippedNoPhone++;
        continue;
      }
      if (!lead.businessName) continue; // Can't identify the business

      const normalizedName = lead.businessName.toLowerCase().trim();
      if (existingNames.has(normalizedName)) {
        skippedDuplicate++;
        console.log(`  [skip duplicate] ${lead.businessName}`);
        continue;
      }

      newLeads.push(lead);
    }

    console.log(`  ${skippedNoPhone} skipped (no phone), ${skippedDuplicate} skipped (duplicate).`);

    if (!newLeads.length) {
      console.log('No new leads to add this run — all results were duplicates or had no phone number.');
      return { success: true, appended: 0 };
    }

    // 5. Write new leads to Google Sheets
    console.log(`Writing ${newLeads.length} new lead(s) to Google Sheets...`);
    let result;
    try {
      result = await appendLeads(newLeads);
    } catch (err) {
      const msg = `Google Sheets write failed: ${err.message}`;
      await handleError(msg);
      return { success: false, error: msg };
    }

    // 6. Print summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✓ Workflow complete in ${elapsed}s — ${result.appended} new lead(s) added:`);
    newLeads.forEach(l =>
      console.log(`  + ${l.businessName.padEnd(35)} ${l.city.padEnd(18)} ${l.phone}`)
    );

    return { success: true, appended: result.appended };

  } catch (err) {
    const msg = `Unexpected workflow error: ${err.stack || err.message}`;
    await handleError(msg);
    return { success: false, error: msg };
  }
}

/**
 * Log the error to console + error.log, then optionally send an email alert.
 */
async function handleError(message) {
  const line = `[ERROR ${new Date().toISOString()}] ${message}`;
  console.error('\n' + line);

  try {
    fs.appendFileSync(ERROR_LOG, line + '\n');
  } catch {
    // If we can't write the log, at least the console error is visible
  }

  await sendEmailAlert(message).catch(() => {});
}

/**
 * Send an email alert if ALERT_EMAIL is configured in .env.
 */
async function sendEmailAlert(message) {
  const alertEmail = process.env.ALERT_EMAIL;
  if (!alertEmail || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Lead Gen Workflow" <${process.env.EMAIL_USER}>`,
    to: alertEmail,
    subject: '[Action Required] Lead Generation Workflow Error',
    text: [
      'Your HVAC lead generation workflow encountered an error and could not complete.',
      '',
      `Error: ${message}`,
      '',
      `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
      '',
      'Check error.log in the project folder for full details.',
      'You may need to run the workflow manually or investigate the API credentials.',
    ].join('\n'),
  });

  console.log(`Alert email sent to ${alertEmail}`);
}

/**
 * Build a human-readable error message from an Axios error response.
 */
function buildApolloErrorMessage(err) {
  if (err.response) {
    const status = err.response.status;
    const body = err.response.data;
    if (status === 401) return 'Apollo API key is invalid or expired (401 Unauthorized).';
    if (status === 422) return `Apollo rejected the search parameters: ${JSON.stringify(body)}`;
    if (status === 429) return 'Apollo API rate limit exceeded (429). The workflow will retry tomorrow.';
    return `Apollo API error ${status}: ${body?.message || JSON.stringify(body)}`;
  }
  if (err.code === 'ECONNABORTED') return 'Apollo request timed out after 30 seconds.';
  return `Apollo request failed: ${err.message}`;
}

module.exports = { runWorkflow };
