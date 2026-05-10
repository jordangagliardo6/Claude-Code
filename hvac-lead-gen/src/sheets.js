const { google } = require('googleapis');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

let _sheetsClient = null;

// ── Auth ───────────────────────────────────────────────────────────────────────

async function getClient() {
  if (_sheetsClient) return _sheetsClient;

  const credPath = config.google.credentialsPath;
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at "${credPath}". ` +
      'Download your service account JSON key from Google Cloud Console and ' +
      'either place it at that path or set GOOGLE_CREDENTIALS_PATH in .env.'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

// Shorthand accessors so code reads cleanly
const sid = () => config.google.spreadsheetId;
const tab = () => config.google.sheetName;

// ── Header management ──────────────────────────────────────────────────────────

// Write the header row if the sheet is brand new / empty.
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${tab()}!A1:Z1`,
  });

  const existing = (res.data.values || [])[0] || [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid(),
      range: `${tab()}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.columns] },
    });
    logger.info('[Sheets] Header row written to empty spreadsheet');
  }
}

// ── Duplicate detection ────────────────────────────────────────────────────────

// Read column B (Business Name) and return a Set of lowercase names already present.
async function getExistingBusinessNames(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    // Column B = Business Name (index 1 in config.columns)
    range: `${tab()}!B:B`,
  });

  const rows = res.data.values || [];
  // Skip row 1 (header)
  return new Set(
    rows.slice(1)
      .map(row => (row[0] || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

// ── Row builder ────────────────────────────────────────────────────────────────

function leadToRow(lead) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  // Order must match config.columns exactly:
  // Date Added | Business Name | First Name | Last Name | Phone | City | Website | Called | Notes
  return [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website || '',
    '', // Called — left blank for user to fill in
    '', // Notes  — left blank for user to fill in
  ];
}

// ── Public API ─────────────────────────────────────────────────────────────────

// Filter out duplicates, then append the remaining leads as new rows.
async function writeLeads(leads) {
  const sheets = await getClient();

  await ensureHeaders(sheets);

  logger.info('[Sheets] Reading existing business names to check for duplicates...');
  const existing = await getExistingBusinessNames(sheets);
  logger.info(`[Sheets] ${existing.size} existing businesses found in sheet`);

  const newLeads = leads.filter(lead => {
    const key = lead.businessName.trim().toLowerCase();
    if (!key) return false;
    if (existing.has(key)) {
      logger.info(`[Sheets] Skipping duplicate: "${lead.businessName}"`);
      return false;
    }
    return true;
  });

  if (newLeads.length === 0) {
    logger.warn('[Sheets] All returned leads are already in the spreadsheet — nothing to append');
    return 0;
  }

  const rows = newLeads.map(leadToRow);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${tab()}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.success(`[Sheets] Appended ${rows.length} new lead(s) to "${tab()}"`);
  return rows.length;
}

// Lightweight connection + permission test
async function verify() {
  logger.info('[Sheets] Verifying Google Sheets connection...');
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: sid(),
      fields: 'properties.title',
    });
    const title = res.data.properties?.title || '(unknown)';
    logger.success(`[Sheets] Connected to spreadsheet: "${title}"`);
    return true;
  } catch (err) {
    const hint =
      err.message.includes('not found') || err.message.includes('Unable to parse')
        ? 'Check that GOOGLE_SPREADSHEET_ID is correct.'
        : err.message.includes('403')
        ? 'The service account does not have access. Share the spreadsheet with your service account email.'
        : '';
    logger.error(`[Sheets] Verification failed. ${hint}`, err);
    return false;
  }
}

module.exports = { writeLeads, verify };
