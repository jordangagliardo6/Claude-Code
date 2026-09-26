/**
 * Google Sheets API client.
 *
 * Uses a Service Account (key file) for server-side auth — no browser required.
 * The service account email must be shared on the target spreadsheet with
 * "Editor" access before this will work.
 */

const { google } = require('googleapis');
const config = require('./config');

let _sheetsClient = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const auth = new google.auth.GoogleAuth({
    keyFile: config.googleKeyFile,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });

  const authClient = await auth.getClient();
  _sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return _sheetsClient;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Return a Set of all existing business names (lowercased) for duplicate checks.
 * Reads column B only — fast and cheap.
 */
async function getExistingBusinessNames() {
  const sheets = await getSheetsClient();

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!B:B`,
  });

  const rows = data.values || [];
  // Skip header row (row 0), lowercase every name for case-insensitive comparison.
  return new Set(rows.slice(1).map(r => (r[0] || '').toLowerCase().trim()));
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Append new leads to the spreadsheet.
 * Deduplication is done before writing — any lead whose Business Name already
 * exists (case-insensitive) is silently skipped.
 *
 * Column order (must match config.columns):
 *   A: Date Added | B: Business Name | C: First Name | D: Last Name |
 *   E: Phone      | F: City          | G: Website    | H: Called    | I: Notes
 *
 * @param {Array} leads - formatted lead objects from apollo.getEnrichedLeads()
 * @returns {number} count of rows actually written
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) return 0;

  const existing = await getExistingBusinessNames();

  const newLeads = leads.filter(lead => {
    const name = (lead.businessName || '').toLowerCase().trim();
    return name.length > 0 && !existing.has(name);
  });

  if (newLeads.length === 0) {
    console.log(`[Sheets] All ${leads.length} leads are duplicates — nothing written`);
    return 0;
  }

  const rows = newLeads.map(lead => [
    lead.dateAdded,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called — left blank
    '', // Notes — left blank
  ]);

  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId:   config.googleSpreadsheetId,
    range:           `${config.googleSheetName}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  const skipped = leads.length - newLeads.length;
  console.log(`[Sheets] Wrote ${newLeads.length} new leads` +
    (skipped > 0 ? ` (skipped ${skipped} duplicates)` : ''));

  return newLeads.length;
}

// ── Verification ──────────────────────────────────────────────────────────────

/**
 * Quick connectivity check — returns the spreadsheet title on success.
 */
async function testConnection() {
  const sheets = await getSheetsClient();

  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSpreadsheetId,
    fields: 'properties.title,spreadsheetId',
  });

  return {
    title: data.properties.title,
    id:    data.spreadsheetId,
    url:   `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
  };
}

module.exports = { appendLeads, testConnection, getExistingBusinessNames };
