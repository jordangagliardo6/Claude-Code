/**
 * Google Sheets client
 *
 * Authenticates via a Service Account JSON key file (no interactive OAuth needed).
 * Reads existing Business Names to deduplicate, then appends new rows.
 *
 * Column layout (must match your spreadsheet):
 *   A: Date Added  B: Business Name  C: Owner First Name  D: Owner Last Name
 *   E: Phone Number  F: City  G: Website  H: Called  I: Notes
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Validate environment variables and confirm the spreadsheet is accessible.
 * Call this on startup to catch config errors before the first scheduled run.
 *
 * @returns {Promise<{ ok: boolean, spreadsheetTitle: string }>}
 */
async function testConnection() {
  const sheets = await buildSheetsClient();
  const spreadsheetId = requireEnv('GOOGLE_SPREADSHEET_ID');

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return { ok: true, spreadsheetTitle: meta.data.properties.title };
}

/**
 * Ensure the header row exists in the sheet.
 * Safe to call on every startup — it checks first and only writes if the row is missing.
 */
async function ensureHeaders() {
  const sheets = await buildSheetsClient();
  const spreadsheetId = requireEnv('GOOGLE_SPREADSHEET_ID');
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';
  const range = `${tab}!A1:I1`;

  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  if (existing.data.values && existing.data.values.length > 0) return; // Already there

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    resource: {
      values: [[
        'Date Added',
        'Business Name',
        'Owner First Name',
        'Owner Last Name',
        'Phone Number',
        'City',
        'Website',
        'Called',
        'Notes',
      ]],
    },
  });
  console.log('  Header row created.');
}

/**
 * Append leads to the sheet, skipping any whose Business Name already exists.
 *
 * @param {Array} leads - Lead objects from apollo.js
 * @returns {Promise<{ added: number, skipped: number }>}
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) return { added: 0, skipped: 0 };

  const sheets = await buildSheetsClient();
  const spreadsheetId = requireEnv('GOOGLE_SPREADSHEET_ID');
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  // Read existing Business Names (column B) to detect duplicates
  const existing = await getExistingBusinessNames(sheets, spreadsheetId, tab);

  const today = formatDate(new Date());
  const rowsToAdd = [];
  let skipped = 0;

  for (const lead of leads) {
    const nameKey = (lead.businessName || '').toLowerCase().trim();
    if (!nameKey) { skipped++; continue; }
    if (existing.has(nameKey)) { skipped++; continue; }

    rowsToAdd.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — left blank intentionally
      '', // Notes — left blank intentionally
    ]);

    // Mark as seen so we don't double-add within the same batch
    existing.add(nameKey);
  }

  if (rowsToAdd.length === 0) return { added: 0, skipped };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: rowsToAdd },
  });

  return { added: rowsToAdd.length, skipped };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function buildSheetsClient() {
  const keyPath = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './service-account-key.json'
  );

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Service account key file not found at: ${keyPath}\n` +
      'See SETUP.md for instructions on creating it.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function getExistingBusinessNames(sheets, spreadsheetId, tab) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!B:B`, // Business Name column
  });

  const rows = response.data.values || [];
  const names = new Set();

  // Skip row 0 (header), collect everything else
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][0] || '').toLowerCase().trim();
    if (name) names.add(name);
  }

  return names;
}

function formatDate(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`${key} environment variable is not set`);
  return val;
}

module.exports = { testConnection, ensureHeaders, appendLeads };
