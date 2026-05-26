const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

const SPREADSHEET_ID = config.sheets.spreadsheetId;
const SHEET_NAME = config.sheets.sheetName;

// ── Auth ───────────────────────────────────────────────────────────────────
// Authenticates using a Service Account JSON key file.
// The key file path is set via GOOGLE_SERVICE_ACCOUNT_PATH in .env.
function getAuth() {
  const credPath = path.resolve(config.sheets.credentialsPath);

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google Service Account key not found at: ${credPath}\n` +
      'Follow SETUP.md to create a service account and place the JSON key there.'
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Read existing business names ───────────────────────────────────────────
// Reads column B (Business Name) to build the deduplication set.
async function getExistingBusinessNames() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B:B`,
  });

  const rows = response.data.values || [];
  // Skip header row; normalize to lowercase for case-insensitive comparison
  const names = rows.slice(1).flat().map(n => n.trim().toLowerCase());
  logger.info(`Sheet has ${names.length} existing business names`);
  return new Set(names);
}

// ── Append rows ────────────────────────────────────────────────────────────
// Appends an array of lead objects to the sheet.
async function appendLeads(leads) {
  if (leads.length === 0) {
    logger.info('No new leads to append');
    return 0;
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  const rows = leads.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '',   // Called — intentionally blank
    '',   // Notes — intentionally blank
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Appended ${rows.length} new lead(s) to the sheet`);
  return rows.length;
}

// ── Verify connection ──────────────────────────────────────────────────────
// Reads spreadsheet metadata — used by the test-connection script.
async function verifyConnection() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return meta.data.properties?.title || 'Connected (title unavailable)';
}

module.exports = { getExistingBusinessNames, appendLeads, verifyConnection };
