'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { COLUMN_ORDER, HEADERS } = require('./config');

let _sheetsClient = null;

// Build and cache the Google Sheets API client using service account credentials
async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json'
  );

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials not found at: ${credPath}\n` +
        'See credentials/SETUP.md for instructions.'
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

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID is not set in your .env file');
  return id;
}

function getTab() {
  return process.env.GOOGLE_SHEET_TAB || 'Leads';
}

/**
 * Read all existing rows and return a Set of business names (lowercased) for
 * duplicate detection. Also returns whether the header row exists.
 */
async function readExistingBusinessNames() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const tab = getTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:B`, // Date Added (A) + Business Name (B)
  });

  const rows = res.data.values || [];
  if (rows.length === 0) return { names: new Set(), hasHeader: false };

  // Row 0 is the header — check if it looks like our header
  const firstRow = rows[0];
  const hasHeader =
    firstRow[0] === 'Date Added' || firstRow[1] === 'Business Name';

  const names = new Set();
  const dataRows = hasHeader ? rows.slice(1) : rows;
  for (const row of dataRows) {
    const businessName = (row[1] || '').trim().toLowerCase();
    if (businessName) names.add(businessName);
  }

  return { names, hasHeader };
}

/**
 * Ensure the header row exists; write it if the sheet is brand new.
 */
async function ensureHeaderRow() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const tab = getTab();

  const { hasHeader } = await readExistingBusinessNames();
  if (hasHeader) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });

  console.log('[Sheets] Header row written.');
}

/**
 * Convert a lead object to a row array matching COLUMN_ORDER / HEADERS.
 */
function leadToRow(lead) {
  return COLUMN_ORDER.map((key) => lead[key] ?? '');
}

/**
 * Append an array of lead objects to the sheet, skipping duplicates.
 * Returns { added, skipped } counts.
 */
async function appendLeads(leads) {
  if (leads.length === 0) return { added: 0, skipped: 0 };

  await ensureHeaderRow();

  const { names: existing } = await readExistingBusinessNames();
  const newLeads = leads.filter((lead) => {
    const key = lead.businessName.trim().toLowerCase();
    return key && !existing.has(key);
  });

  const skipped = leads.length - newLeads.length;

  if (newLeads.length === 0) {
    console.log(`[Sheets] All ${leads.length} leads already in sheet. Nothing to add.`);
    return { added: 0, skipped };
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const tab = getTab();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newLeads.map(leadToRow) },
  });

  console.log(`[Sheets] Appended ${newLeads.length} new leads. Skipped ${skipped} duplicates.`);
  return { added: newLeads.length, skipped };
}

/**
 * Verify the sheet is reachable and the header exists. Used at startup.
 */
async function verifyConnection() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  const tab = getTab();

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = res.data.sheets.map((s) => s.properties.title);

  if (!sheetNames.includes(tab)) {
    throw new Error(
      `Tab "${tab}" not found in spreadsheet. Available tabs: ${sheetNames.join(', ')}`
    );
  }

  console.log(`[Sheets] Connected to spreadsheet: "${res.data.properties.title}"`);
  console.log(`[Sheets] Target tab: "${tab}"`);
  return true;
}

module.exports = { appendLeads, verifyConnection, readExistingBusinessNames };
