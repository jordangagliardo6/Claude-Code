'use strict';

/**
 * Google Sheets integration.
 *
 * Uses a Google Service Account for auth — no interactive OAuth needed for cron jobs.
 *
 * Sheet column layout (A–I):
 *   A: Date Added
 *   B: Business Name       ← duplicate-check key
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called              (left blank by this script)
 *   I: Notes               (left blank by this script)
 *
 * To change the column layout, update COLUMNS and the mapping in buildRow().
 */

const { google } = require('googleapis');
const logger = require('./logger');

const SHEET_NAME = 'Leads';  // Name of the tab inside the spreadsheet

// ── Column definitions — edit to add/remove/reorder columns ──────────────────
const COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];
// ─────────────────────────────────────────────────────────────────────────────

let _auth = null;

async function getAuth() {
  if (_auth) return _auth;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set in .env');
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _auth = await auth.getClient();
  return _auth;
}

function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensure the sheet exists and has the correct header row.
 * If the sheet tab doesn't exist, it will be created.
 */
async function ensureSheet() {
  const auth = await getAuth();
  const sheets = getSheetsClient(auth);
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  // Check if our tab already exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetList = meta.data.sheets.map((s) => s.properties.title);

  if (!sheetList.includes(SHEET_NAME)) {
    logger.info(`Sheet tab "${SHEET_NAME}" not found — creating it...`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
      },
    });
  }

  // Ensure header row is present
  const headerRange = `${SHEET_NAME}!A1:${colLetter(COLUMNS.length)}1`;
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
  });

  const existingHeader = (headerRes.data.values || [])[0] || [];
  if (existingHeader.length === 0) {
    logger.info('Writing header row...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: headerRange,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
  }
}

/**
 * Read all existing business names from column B to detect duplicates.
 * Returns a Set of lowercase names.
 */
async function getExistingBusinessNames() {
  const auth = await getAuth();
  const sheets = getSheetsClient(auth);
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  // Column B = Business Name (index 1)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!B2:B`,
  });

  const rows = res.data.values || [];
  const names = new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
  logger.info(`Found ${names.size} existing business(es) in sheet.`);
  return names;
}

/**
 * Append an array of lead objects to the sheet.
 * Skips leads whose business name already appears in existingNames.
 * Returns the count of rows actually written.
 */
async function appendLeads(leads, existingNames) {
  if (leads.length === 0) {
    logger.info('No leads to append.');
    return 0;
  }

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const rows = [];
  const skipped = [];

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key) continue; // skip empty business names

    if (existingNames.has(key)) {
      skipped.push(lead.businessName);
      continue;
    }

    rows.push(buildRow(lead, today));
    existingNames.add(key); // prevent intra-batch duplicates
  }

  if (skipped.length > 0) {
    logger.info(`Skipped ${skipped.length} duplicate(s): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`);
  }

  if (rows.length === 0) {
    logger.info('All leads were duplicates — nothing new to add.');
    return 0;
  }

  const auth = await getAuth();
  const sheets = getSheetsClient(auth);
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:${colLetter(COLUMNS.length)}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Appended ${rows.length} new lead(s) to "${SHEET_NAME}".`);
  return rows.length;
}

/**
 * Map a lead object to a row array matching COLUMNS order.
 * To change columns, update COLUMNS above and this function together.
 */
function buildRow(lead, dateAdded) {
  return [
    dateAdded,           // A: Date Added
    lead.businessName,   // B: Business Name
    lead.firstName,      // C: Owner First Name
    lead.lastName,       // D: Owner Last Name
    lead.phone,          // E: Phone Number
    lead.city,           // F: City
    lead.website,        // G: Website
    '',                  // H: Called (intentionally blank)
    '',                  // I: Notes  (intentionally blank)
  ];
}

// Convert column index (1-based) to letter: 1→A, 9→I, 26→Z
function colLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

module.exports = { ensureSheet, getExistingBusinessNames, appendLeads };
