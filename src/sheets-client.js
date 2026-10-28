'use strict';

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Column order in the spreadsheet — change here if you ever reorder them
const COLUMNS = [
  'Date Added',    // A
  'Business Name', // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',  // E
  'City',          // F
  'Website',       // G
  'Called',        // H  (left blank — you fill in manually)
  'Notes',         // I  (left blank — you fill in manually)
];

/**
 * Build and return an authenticated Google Sheets client.
 */
async function getAuth() {
  const keyPath = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './credentials/service-account.json'
  );

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Google service account key not found at: ${keyPath}\n` +
      'See credentials/README.md for setup instructions.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

/**
 * Ensure the header row exists. Creates it if the sheet is empty.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetTab) {
  const range = `'${sheetTab}'!A1:I1`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const existingHeaders = res.data.values?.[0] ?? [];

  if (existingHeaders.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
    console.log('Created header row in sheet.');
  }
}

/**
 * Read all existing Business Names from column B (to check for duplicates).
 *
 * @returns {Promise<Set<string>>} Lowercased business names already in the sheet
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetTab) {
  const range = `'${sheetTab}'!B2:B`; // Column B, skip header

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = res.data.values ?? [];
  const names = new Set(rows.map((r) => (r[0] || '').trim().toLowerCase()));
  return names;
}

/**
 * Append new lead rows to the sheet, skipping duplicates.
 *
 * @param {Array} leads           Normalized lead objects from Apollo
 * @param {Set<string>} existing  Set of lowercased business names already in the sheet
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads, existing, sheets, spreadsheetId, sheetTab) {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];

  for (const lead of leads) {
    const key = (lead.businessName || '').trim().toLowerCase();

    if (!key) {
      console.log('  Skipping lead with no business name');
      continue;
    }

    if (existing.has(key)) {
      console.log(`  Duplicate — skipping: ${lead.businessName}`);
      continue;
    }

    newRows.push([
      today,                // A: Date Added
      lead.businessName,    // B: Business Name
      lead.firstName,       // C: Owner First Name
      lead.lastName,        // D: Owner Last Name
      lead.phone,           // E: Phone Number
      lead.city,            // F: City
      lead.website,         // G: Website
      '',                   // H: Called (blank)
      '',                   // I: Notes (blank)
    ]);

    // Add to existing set so we don't re-add within the same run
    existing.add(key);
  }

  if (newRows.length === 0) {
    return { added: 0, skipped: leads.length };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetTab}'!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return { added: newRows.length, skipped: leads.length - newRows.length };
}

/**
 * Main entry point: authenticate, check headers, de-dupe, append.
 *
 * @param {Array} leads  Normalized leads from Apollo
 * @returns {{ added: number, skipped: number }}
 */
async function writeLeadsToSheet(leads) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetTab = process.env.GOOGLE_SHEET_TAB || 'HVAC Leads';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in your .env file');
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await ensureHeaders(sheets, spreadsheetId, sheetTab);

  const existing = await getExistingBusinessNames(sheets, spreadsheetId, sheetTab);
  console.log(`  Found ${existing.size} existing businesses in sheet.`);

  return appendLeads(leads, existing, sheets, spreadsheetId, sheetTab);
}

module.exports = { writeLeadsToSheet };
