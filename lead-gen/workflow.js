require('dotenv').config();
const { searchPeople, enrichPeople, extractLeadData } = require('./apollo');
const { appendLeads } = require('./sheets');
const nodemailer = require('nodemailer');

const MAX_LEADS_PER_RUN = 25;

async function sendErrorEmail(error) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('SMTP not configured — skipping error email. Error was:', error.message);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"HVAC Lead Gen" <${process.env.SMTP_USER}>`,
    to: process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER,
    subject: '[HVAC Lead Gen] Workflow Error — Manual Check Needed',
    text: [
      `The HVAC lead generation workflow failed at ${new Date().toISOString()}.`,
      '',
      `Error: ${error.message}`,
      '',
      'Stack:',
      error.stack,
      '',
      'Check your Apollo API key, Google credentials, and Sheet ID in .env',
    ].join('\n'),
  });
}

async function runWorkflow() {
  const apiKey = process.env.APOLLO_API_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    throw new Error('APOLLO_API_KEY is not set. Copy .env.example to .env and fill in your key.');
  }
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env');
  }
  if (!credPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set in .env');
  }

  const ts = () => new Date().toISOString();

  console.log(`[${ts()}] ▶ Starting HVAC lead generation run (max ${MAX_LEADS_PER_RUN} leads)`);

  // Step 1: Search Apollo for HVAC owners in SW Michigan
  console.log(`[${ts()}] Searching Apollo.io...`);
  let searchResult;
  try {
    searchResult = await searchPeople(apiKey, 1, MAX_LEADS_PER_RUN);
  } catch (err) {
    if (err.response?.status === 403 || err.response?.data?.error_code === 'API_INACCESSIBLE') {
      throw new Error(
        'Apollo API access denied. The people search endpoint requires a paid Apollo plan (Basic $49/mo+). ' +
        'Upgrade at https://www.apollo.io/pricing'
      );
    }
    throw err;
  }

  const people = searchResult?.people || [];
  if (people.length === 0) {
    throw new Error(
      'Apollo returned 0 results. Try broadening the search locations or keywords in apollo.js.'
    );
  }

  console.log(`[${ts()}] Found ${people.length} candidates. Enriching for phone numbers...`);

  // Step 2: Enrich to reveal phone numbers (costs credits — 1 credit per person)
  const personIds = people.map(p => p.id).filter(Boolean);
  const enriched = await enrichPeople(apiKey, personIds);

  // Step 3: Extract leads that have a phone number
  const leads = enriched
    .map(extractLeadData)
    .filter(Boolean)
    .slice(0, MAX_LEADS_PER_RUN);

  console.log(`[${ts()}] ${leads.length} leads have phone numbers.`);

  if (leads.length === 0) {
    throw new Error(
      'No leads with phone numbers found after enrichment. ' +
      'Apollo may not have phone data for these contacts, or your plan may not include phone reveal.'
    );
  }

  // Step 4: Write to Google Sheets, skipping any duplicate business names
  console.log(`[${ts()}] Writing to Google Sheets (ID: ${sheetId})...`);
  const result = await appendLeads(sheetId, credPath, leads);

  console.log(
    `[${ts()}] ✅ Done. Added: ${result.added} new leads. Skipped: ${result.skipped} duplicates.`
  );
  return result;
}

runWorkflow().catch(async err => {
  console.error(`[${new Date().toISOString()}] ❌ Workflow failed:`, err.message);
  try {
    await sendErrorEmail(err);
  } catch (emailErr) {
    console.error('Failed to send error email:', emailErr.message);
  }
  process.exit(1);
});
