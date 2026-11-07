/**
 * Google Sheets integration.
 *
 * Uses a service-account JSON file for auth (no browser OAuth needed).
 * Reads existing business names to prevent duplicates, then appends new rows.
 *
 * Sheet column order (1-indexed, matches the spreadsheet header row):
 *   A: Date Added
 *   B: Business Name  ← duplicate-check key
 *   C: Owner First Name
 *   D: Owner Last Name
 *   E: Phone Number
 *   F: City
 *   G: Website
 *   H: Called          (left blank — user fills in)
 *   I: Notes           (left blank — user fills in)
 */

'use strict';

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

/**
 * Build an authenticated Google Sheets client from a service-account file.
 *
 * @param {string} credentialsPath  Absolute or relative path to the JSON key
 * @returns {import('googleapis').sheets_v4.Sheets}
 */
function buildSheetsClient(credentialsPath) {
  const resolvedPath = path.resolve(credentialsPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Google credentials file not found at: ${resolvedPath}\n` +
        'Run "node setup.js" for setup instructions.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensure the header row exists in the sheet. Creates it if the sheet is empty.
 */
async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  const range = `'${sheetName}'!A1:I1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length === 0 || rows[0].length === 0) {
    // Sheet is empty — write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          [
            'Date Added',
            'Business Name',
            'Owner First Name',
            'Owner Last Name',
            'Phone Number',
            'City',
            'Website',
            'Called',
            'Notes',
          ],
        ],
      },
    });
    console.log('[sheets] Header row created.');
  }
}

/**
 * Read all existing business names from column B (rows 2+).
 * Returns a Set<string> of lowercase names for fast lookup.
 */
async function getExistingBusinessNames(sheets, spreadsheetId, sheetName) {
  const range = `'${sheetName}'!B2:B`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  return new Set(rows.map((r) => (r[0] || '').trim().toLowerCase()));
}

/**
 * Append an array of lead objects as new rows, skipping duplicates.
 *
 * @param {string}  credentialsPath  Path to service-account JSON
 * @param {string}  spreadsheetId   Google Sheet ID
 * @param {string}  sheetName       Tab name (default "Sheet1")
 * @param {Array}   leads           Normalized leads from apollo.js
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(credentialsPath, spreadsheetId, sheetName, leads) {
  const sheets = buildSheetsClient(credentialsPath);

  await ensureHeaders(sheets, spreadsheetId, sheetName);

  const existing = await getExistingBusinessNames(
    sheets,
    spreadsheetId,
    sheetName
  );

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.trim().toLowerCase();
    if (existing.has(key)) {
      skipped++;
      console.log(`[sheets] Skipping duplicate: ${lead.businessName}`);
      continue;
    }
    // Mark as seen so we don't add the same business twice within one batch
    existing.add(key);
    newRows.push([
      today,          // A: Date Added
      lead.businessName,  // B: Business Name
      lead.firstName,     // C: Owner First Name
      lead.lastName,      // D: Owner Last Name
      lead.phone,         // E: Phone Number
      lead.city,          // F: City
      lead.website,       // G: Website
      '',                 // H: Called (blank)
      '',                 // I: Notes (blank)
    ]);
  }

  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  console.log(
    `[sheets] Done — ${newRows.length} added, ${skipped} duplicates skipped.`
  );
  return { added: newRows.length, skipped };
}

module.exports = { appendLeads, buildSheetsClient };
