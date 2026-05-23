'use strict';

const fs = require('fs');
const { google } = require('googleapis');
const config = require('./config');

// Build a Google auth client from service account credentials
function getAuthClient() {
  let keyData;

  if (config.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64) {
    // Inline base64 — useful in CI / cloud environments
    keyData = JSON.parse(Buffer.from(config.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8'));
  } else if (fs.existsSync(config.GOOGLE_SERVICE_ACCOUNT_KEY_FILE)) {
    keyData = JSON.parse(fs.readFileSync(config.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, 'utf8'));
  } else {
    throw new Error(
      `Google service account key not found.\n` +
      `Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE in .env and place the JSON file at that path,\n` +
      `or set GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 with a base64-encoded version.`
    );
  }

  return new google.auth.GoogleAuth({
    credentials: keyData,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Read all existing business names from column B (index 1) so we can dedup.
 * Returns a Set of lowercased names.
 */
async function getExistingBusinessNames() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = `${config.SHEET_TAB_NAME}!B:B`; // Business Name column

  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range,
    });
  } catch (err) {
    throw new Error(`Failed to read spreadsheet: ${err.message}`);
  }

  const rows = response.data.values || [];
  // rows[0] is the header — skip it
  const names = new Set(
    rows.slice(1).map(row => (row[0] || '').toLowerCase().trim()).filter(Boolean)
  );
  return names;
}

/**
 * Append new lead rows to the spreadsheet.
 * Skips any lead whose businessName already exists (case-insensitive).
 *
 * @param {Array<Object>} leads - normalized lead objects from apolloService
 * @returns {{ added: number, skipped: number }}
 */
async function appendLeads(leads) {
  if (!leads || leads.length === 0) return { added: 0, skipped: 0 };

  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const existingNames = await getExistingBusinessNames();
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const newRows = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = (lead.businessName || '').toLowerCase().trim();
    if (!key || existingNames.has(key)) {
      skipped++;
      continue;
    }

    // Row order must match SHEET_COLUMNS in config.js:
    // Date Added, Business Name, Owner First Name, Owner Last Name,
    // Phone Number, City, Website, Called (blank), Notes (blank)
    newRows.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — intentionally blank
      '', // Notes  — intentionally blank
    ]);

    // Track as added so parallel calls don't re-insert within same run
    existingNames.add(key);
  }

  if (newRows.length === 0) return { added: 0, skipped };

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_TAB_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  } catch (err) {
    throw new Error(`Failed to write to spreadsheet: ${err.message}`);
  }

  return { added: newRows.length, skipped };
}

/**
 * Verify the spreadsheet is accessible and the header row looks correct.
 * Returns an object with { ok: true } or throws.
 */
async function verifyConnection() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_TAB_NAME}!A1:I1`,
  });

  const headerRow = (response.data.values || [[]])[0] || [];
  return {
    ok: true,
    spreadsheetId: config.SPREADSHEET_ID,
    sheetTab: config.SHEET_TAB_NAME,
    headerRow,
  };
}

module.exports = { appendLeads, getExistingBusinessNames, verifyConnection };
