// ─── Apollo HVAC Lead Generation — Main Entry Point ──────────────────────────
// Runs automatically on a cron schedule (default: 7 AM Eastern daily).
//
// Usage:
//   node index.js              → starts the scheduler (keeps running)
//   node index.js --run-now   → one manual run, then exits
//   node index.js --verify    → connection test only, no leads written

require('dotenv').config();

const cron = require('node-cron');
const config = require('./config');
const { searchPeople, enrichPeople, formatLead, verifyApiKey } = require('./apollo');
const {
  initSheets,
  ensureHeaders,
  getExistingBusinessNames,
  appendLeads,
  verifyConnection,
} = require('./sheets');

// ─── Main workflow ────────────────────────────────────────────────────────────
async function runLeadGeneration() {
  const startTime = new Date();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${startTime.toISOString()}] HVAC Lead Generation — starting run`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // Step 1: Connect to Google Sheets and read existing data
    console.log('\n[1/5] Connecting to Google Sheets...');
    await initSheets();

    const { id: spreadsheetId, sheetName, columns, businessNameColumnIndex } =
      config.spreadsheet;

    await ensureHeaders(spreadsheetId, sheetName, columns);
    const existingNames = await getExistingBusinessNames(
      spreadsheetId,
      sheetName,
      businessNameColumnIndex
    );
    console.log(`      ${existingNames.size} existing businesses loaded for dedup check.`);

    // Step 2: Search Apollo for matching people
    console.log('\n[2/5] Searching Apollo.io for HVAC owners in SW Michigan...');
    const searchResults = await searchPeople(config);
    console.log(`      Apollo returned ${searchResults.length} people.`);

    if (!searchResults.length) {
      const msg =
        'Apollo returned 0 results. Check your API key plan, search filters, or try again later.';
      console.warn(`\n⚠️  ${msg}`);
      notifyError(msg);
      return;
    }

    // Step 3: Deduplicate before enrichment (every enrichment costs a credit)
    console.log('\n[3/5] Filtering duplicates...');
    const newPeople = searchResults.filter(person => {
      const name = (person.organization?.name || '').toLowerCase().trim();
      return name.length > 0 && !existingNames.has(name);
    });

    const skippedCount = searchResults.length - newPeople.length;
    console.log(
      `      ${newPeople.length} new | ${skippedCount} already in sheet (skipped)`
    );

    if (!newPeople.length) {
      console.log('\n✅ All results already in sheet — nothing new to add this run.');
      return;
    }

    // Step 4: Cap at max per run, then enrich to reveal phone numbers
    const toEnrich = newPeople.slice(0, config.maxLeadsPerRun);
    console.log(
      `\n[4/5] Enriching ${toEnrich.length} people to reveal phone numbers...`
    );
    console.log('      (each enrichment costs 1 Apollo credit)');

    const personIds = toEnrich.map(p => p.id).filter(Boolean);
    const enriched = await enrichPeople(personIds);
    const enrichedById = Object.fromEntries(enriched.map(e => [e.id, e]));

    // Step 5: Format rows and write to sheet
    console.log('\n[5/5] Writing new leads to Google Sheets...');
    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });

    const newRows = [];
    const skippedNoPhone = [];

    for (const person of toEnrich) {
      const lead = formatLead(person, enrichedById[person.id]);

      // Skip contacts with no phone — per the spec
      if (!lead.phone) {
        skippedNoPhone.push(lead.businessName || person.id);
        continue;
      }

      // Row values must match config.spreadsheet.columns order exactly
      newRows.push([
        today,              // Date Added
        lead.businessName,  // Business Name
        lead.firstName,     // Owner First Name
        lead.lastName,      // Owner Last Name
        lead.phone,         // Phone Number
        lead.city,          // City
        lead.website,       // Website
        '',                 // Called (blank — filled manually)
        '',                 // Notes (blank — filled manually)
      ]);
    }

    if (skippedNoPhone.length) {
      console.log(
        `      Skipped ${skippedNoPhone.length} lead(s) with no phone number.`
      );
    }

    if (!newRows.length) {
      const msg = `Enrichment returned no phone numbers for ${toEnrich.length} leads. ` +
        'Your Apollo plan may not include phone reveal, or these contacts have no phone on file.';
      console.warn(`\n⚠️  ${msg}`);
      notifyError(msg);
      return;
    }

    const written = await appendLeads(spreadsheetId, sheetName, newRows);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Done — ${written} new leads added to "${sheetName}". (${elapsed}s)`);
    console.log(
      `   Sheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit\n`
    );
  } catch (err) {
    const msg = `Run failed: ${err.message}`;
    console.error(`\n❌ [ERROR] ${msg}`);
    console.error(err.stack);
    notifyError(msg);
  }
}

// ─── Error notifications ───────────────────────────────────────────────────────
// Errors are always logged to the console. To add email alerts, install
// nodemailer and fill in the SMTP block below.
function notifyError(message) {
  const timestamp = new Date().toISOString();
  console.error(
    `\n⚠️  LEAD GEN ERROR [${timestamp}]\n   ${message}\n` +
    `   Check the logs above for details.\n`
  );

  // ── Optional email alert (uncomment + install nodemailer to enable) ─────────
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: { user: process.env.ALERT_EMAIL, pass: process.env.ALERT_EMAIL_PASSWORD },
  // });
  // transporter.sendMail({
  //   from: process.env.ALERT_EMAIL,
  //   to: process.env.ALERT_EMAIL,
  //   subject: '⚠️ HVAC Lead Gen Error',
  //   text: `Error at ${timestamp}:\n\n${message}`,
  // }).catch(e => console.error('Failed to send email alert:', e.message));
}

// ─── Verify connections ───────────────────────────────────────────────────────
// Run with --verify before your first scheduled run to confirm everything works.
async function verifyConnections() {
  console.log('\n🔍 Verifying connections...\n');
  let allOk = true;

  // Test Apollo API key
  try {
    const ok = await verifyApiKey();
    if (ok) {
      console.log('✅ Apollo.io — API key valid and authenticated.');
    } else {
      console.error('❌ Apollo.io — API key returned invalid auth status.');
      allOk = false;
    }
  } catch (e) {
    console.error(`❌ Apollo.io — Connection failed: ${e.message}`);
    if (e.response?.status === 401) {
      console.error('   Your APOLLO_API_KEY may be invalid or expired.');
    }
    allOk = false;
  }

  // Test Google Sheets
  try {
    await initSheets();
    const { id: spreadsheetId, sheetName, columns, businessNameColumnIndex } =
      config.spreadsheet;

    const title = await verifyConnection(spreadsheetId);
    console.log(`✅ Google Sheets — Connected to "${title}".`);

    await ensureHeaders(spreadsheetId, sheetName, columns);
    const names = await getExistingBusinessNames(
      spreadsheetId, sheetName, businessNameColumnIndex
    );
    console.log(
      `   Sheet tab "${sheetName}" has ${names.size} existing lead(s). ` +
      'Headers confirmed.'
    );
  } catch (e) {
    console.error(`❌ Google Sheets — Connection failed: ${e.message}`);
    if (e.message.includes('credentials.json')) {
      console.error('   Make sure credentials.json exists in this directory.');
      console.error('   See .env.example for setup instructions.');
    } else if (e.message.includes('403')) {
      console.error(
        '   The service account may not have Editor access to the spreadsheet.'
      );
    }
    allOk = false;
  }

  if (allOk) {
    console.log(
      '\n✅ All connections verified — ready to schedule.\n' +
      '   Run "npm start" to launch the daily 7 AM cron.\n'
    );
    return true;
  } else {
    console.error(
      '\n❌ One or more connections failed. Fix the errors above before scheduling.\n'
    );
    return false;
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (!process.env.APOLLO_API_KEY) {
    console.error('❌ APOLLO_API_KEY is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  if (args.includes('--verify')) {
    const ok = await verifyConnections();
    process.exit(ok ? 0 : 1);
  }

  if (args.includes('--run-now')) {
    await runLeadGeneration();
    process.exit(0);
  }

  // Default: start the cron scheduler
  console.log(
    `[Scheduler] Starting HVAC Lead Gen cron.\n` +
    `  Schedule : ${config.cronSchedule} (America/New_York)\n` +
    `  Max leads: ${config.maxLeadsPerRun} per run\n` +
    `  Sheet    : https://docs.google.com/spreadsheets/d/${config.spreadsheet.id}/edit\n`
  );

  cron.schedule(config.cronSchedule, runLeadGeneration, {
    timezone: 'America/New_York',
  });

  console.log('Cron is active. Keep this process running (e.g. with pm2 or a systemd service).');
  console.log('Press Ctrl+C to stop.\n');
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
