'use strict';

// ─── Google Sheets Client ─────────────────────────────────────
// Reads the existing spreadsheet to detect duplicates,
// then appends new lead rows.

const { google } = require('googleapis');
const { getAuthClient } = require('./auth');
const config = require('./config');

let _sheetsClient = null;

async function _getClient() {
  if (_sheetsClient) return _sheetsClient;
  const auth = await getAuthClient();
  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

/**
 * Read all values in column B (Business Name) and return them as a
 * lowercase Set for fast duplicate lookups.
 *
 * @param {string} spreadsheetId
 * @param {string} tab  - sheet tab name (e.g. "Leads")
 */
async function getExistingBusinessNames(spreadsheetId, tab) {
  const sheets = await _getClient();

  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!B:B`, // Column B = Business Name
    });
  } catch (err) {
    const detail = err.errors?.[0]?.message || err.message;
    throw new Error(`Could not read Google Sheet: ${detail}`);
  }

  const rows = res.data.values ?? [];
  // Row 0 is the header ("Business Name"), skip it
  return new Set(
    rows
      .slice(1)
      .map((row) => (row[0] ?? '').toLowerCase().trim())
      .filter(Boolean)
  );
}

/**
 * Ensure the header row exists. If the sheet is empty, write the headers first.
 *
 * @param {string} spreadsheetId
 * @param {string} tab
 */
async function ensureHeaders(spreadsheetId, tab) {
  const sheets = await _getClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:I1`,
  });

  const existing = res.data.values?.[0] ?? [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [config.sheetColumns] },
    });
    console.log(`[sheets] Header row written to "${tab}".`);
  }
}

/**
 * Append an array of normalized lead objects as new rows.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @param {string}   spreadsheetId
 * @param {string}   tab
 * @param {object[]} leads
 * @returns {number} count of rows appended
 */
async function appendLeads(spreadsheetId, tab, leads) {
  if (leads.length === 0) return 0;

  const sheets = await _getClient();
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const rows = leads.map((lead) => [
    today,                    // A – Date Added
    lead.businessName,        // B – Business Name
    lead.firstName,           // C – Owner First Name
    lead.lastName,            // D – Owner Last Name
    lead.phone,               // E – Phone Number
    lead.city,                // F – City
    lead.website,             // G – Website
    '',                       // H – Called (blank)
    '',                       // I – Notes (blank)
  ]);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
  } catch (err) {
    const detail = err.errors?.[0]?.message || err.message;
    throw new Error(`Failed to append rows to Google Sheet: ${detail}`);
  }

  return rows.length;
}

module.exports = { getExistingBusinessNames, ensureHeaders, appendLeads };
