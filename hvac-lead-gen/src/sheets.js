'use strict';

require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Column order must match the spreadsheet exactly
const HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // intentionally left blank by workflow
  'Notes',    // intentionally left blank by workflow
];

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Builds an authenticated Google Sheets client.
 * Reads a service account JSON from GOOGLE_CREDENTIALS_PATH.
 */
function getAuthClient() {
  const credPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json'
  );
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      'Set GOOGLE_CREDENTIALS_PATH in your .env file and ensure the JSON exists.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

// ─── Header bootstrap ─────────────────────────────────────────────────────────

/**
 * Writes the header row if the sheet is completely empty.
 * Safe to call on every run — does nothing if headers already exist.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:I1`,
  });

  const existingRow = res.data.values?.[0] || [];
  if (existingRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    console.log('[Sheets] Header row written.');
  }
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

/**
 * Returns a Set of lowercased business names already in the sheet.
 * Reads column B (index 1) starting at row 2 to skip the header.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B2:B`,
  });

  const rows = res.data.values || [];
  return new Set(rows.map(r => (r[0] || '').trim().toLowerCase()));
}

// ─── Append ───────────────────────────────────────────────────────────────────

/**
 * Appends an array of lead objects to the sheet.
 * Each lead: { businessName, firstName, lastName, phone, city, website }
 * Returns the number of rows actually written.
 */
async function appendLeads(spreadsheetId, sheetName, leads) {
  if (leads.length === 0) return 0;

  const auth = getAuthClient();
  const sheets = getSheetsClient(auth);

  await ensureHeaders(sheets, spreadsheetId, sheetName);
  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetName);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'America/New_York',
  });

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (existing.has(key)) {
      skipped.push(lead.businessName);
      continue;
    }
    existing.add(key); // guard against dupes within the same batch

    newRows.push([
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
  }

  if (skipped.length > 0) {
    console.log(`[Sheets] Skipped ${skipped.length} duplicate(s): ${skipped.join(', ')}`);
  }

  if (newRows.length === 0) {
    console.log('[Sheets] No new rows to write after deduplication.');
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  console.log(`[Sheets] Appended ${newRows.length} new lead(s).`);
  return newRows.length;
}

// ─── Connection test ──────────────────────────────────────────────────────────

/**
 * Verifies credentials and spreadsheet access. Returns the sheet title.
 */
async function testConnection(spreadsheetId, sheetName) {
  const auth = getAuthClient();
  const sheets = getSheetsClient(auth);

  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const title = res.data.properties?.title || '(untitled)';

  const sheetExists = res.data.sheets?.some(
    s => s.properties?.title === sheetName
  );
  if (!sheetExists) {
    throw new Error(
      `Sheet tab "${sheetName}" not found in spreadsheet "${title}". ` +
      `Available tabs: ${res.data.sheets?.map(s => s.properties.title).join(', ')}`
    );
  }

  return title;
}

module.exports = { appendLeads, testConnection };
