/**
 * sheets.js — Google Sheets client
 *
 * Reads the existing lead list, checks for duplicates by Business Name,
 * and appends new rows.
 *
 * Auth: uses a Google Service Account (recommended for automated scripts).
 * Share your spreadsheet with the service account email before first run.
 *
 * Column order (do not reorder without also updating COLUMNS below):
 *   A: Date Added
 *   B: Business Name
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called      ← left blank, for your use
 *   I: Notes       ← left blank, for your use
 */

'use strict';

const { google } = require('googleapis');
const fs = require('fs');

const SHEET_NAME = 'Sheet1';       // Change if your tab has a different name
const HEADER_ROW = 1;              // Row number of the header (1-indexed)

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

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Build a Google Sheets auth client from environment variables.
 * Supports:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_FILE — path to a JSON key file
 *   GOOGLE_SERVICE_ACCOUNT_KEY_JSON — the entire JSON key as a string
 */
function buildAuth() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    const raw = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, 'utf8');
    credentials = JSON.parse(raw);
  } else {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or ' +
      'GOOGLE_SERVICE_ACCOUNT_KEY_JSON in your .env file.'
    );
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── Header initialization ────────────────────────────────────────────────────

/**
 * Write the header row if the sheet is brand new (A1 is empty).
 */
async function ensureHeaders(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:I1`,
  });

  const firstRow = res.data.values?.[0] || [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('[sheets] Header row written.');
  }
}

// ─── Existing business names ──────────────────────────────────────────────────

/**
 * Return a Set of normalized business names already in the sheet.
 * Normalization: lowercase + trim, so "ABC Heating" and "abc heating" match.
 */
async function getExistingBusinessNames(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Column B = Business Name, skip row 1 (header)
    range: `${SHEET_NAME}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.map((r) => (r[0] || '').toLowerCase().trim()));
}

// ─── Append new leads ─────────────────────────────────────────────────────────

/**
 * Filter out duplicates and append the rest to the sheet.
 *
 * @param {string} spreadsheetId
 * @param {Array}  leads          - normalized lead objects from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(spreadsheetId, leads) {
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets, spreadsheetId);
  const existing = await getExistingBusinessNames(sheets, spreadsheetId);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = (lead.businessName || '').toLowerCase().trim();

    if (!key || existing.has(key)) {
      skipped++;
      continue;
    }

    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone || '',
      lead.city,
      lead.website || '',
      '',  // Called  — blank for user to fill
      '',  // Notes   — blank for user to fill
    ]);

    // Track within this batch to avoid self-duplicates if Apollo returns the
    // same company under two contacts.
    existing.add(key);
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return { added: newRows.length, skipped };
}

/**
 * Lightweight connectivity check — just reads metadata.
 */
async function testConnection(spreadsheetId) {
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.properties?.title || '(untitled)';
}

module.exports = { appendLeads, testConnection };
