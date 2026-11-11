const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let _sheetsClient = null;
let _driveClient = null;

/**
 * Authenticate with Google using a service account JSON file.
 * Returns authorized auth client.
 */
async function getAuthClient() {
  const credPath = path.resolve(config.google.credentialsPath);
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
        'Run "npm run setup" for step-by-step instructions.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: config.google.scopes,
  });

  return auth.getClient();
}

/**
 * Lazily initialize Google Sheets client.
 */
async function getSheetsClient() {
  if (!_sheetsClient) {
    const auth = await getAuthClient();
    _sheetsClient = google.sheets({ version: 'v4', auth });
  }
  return _sheetsClient;
}

/**
 * Lazily initialize Google Drive client.
 */
async function getDriveClient() {
  if (!_driveClient) {
    const auth = await getAuthClient();
    _driveClient = google.drive({ version: 'v3', auth });
  }
  return _driveClient;
}

/**
 * Find or create the target spreadsheet.
 * If GOOGLE_SHEET_ID is set in .env, uses that sheet.
 * Otherwise creates a new sheet named "HVAC Lead Generation" and saves the ID.
 * Returns the sheet ID.
 */
async function ensureSpreadsheet() {
  if (config.sheets.sheetId) {
    return config.sheets.sheetId;
  }

  console.log('[Sheets] No GOOGLE_SHEET_ID set — creating a new spreadsheet...');
  const drive = await getDriveClient();
  const sheets = await getSheetsClient();

  // Create new spreadsheet
  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'HVAC Lead Generation',
      },
      sheets: [
        {
          properties: {
            title: config.sheets.tabName,
            index: 0,
          },
        },
      ],
    },
  });

  const newSheetId = createRes.data.spreadsheetId;
  console.log(`[Sheets] Created spreadsheet: https://docs.google.com/spreadsheets/d/${newSheetId}/edit`);
  console.log(`[Sheets] Add GOOGLE_SHEET_ID=${newSheetId} to your .env file to reuse this sheet.`);

  // Write column headers
  await writeHeaders(newSheetId);

  // Update the in-memory config so this run uses the new ID
  config.sheets.sheetId = newSheetId;
  return newSheetId;
}

/**
 * Write the column header row to the sheet.
 */
async function writeHeaders(sheetId) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${config.sheets.tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [config.sheets.columns],
    },
  });
  console.log('[Sheets] Column headers written.');
}

/**
 * Read all existing rows from the sheet.
 * Returns array of row arrays (excluding header row).
 */
async function readExistingLeads(sheetId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${config.sheets.tabName}!A:I`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return []; // Only header row or empty

  // Skip header row (index 0), return data rows
  return rows.slice(1);
}

/**
 * Extract the set of business names already in the sheet.
 * Used for duplicate detection.
 */
async function getExistingBusinessNames(sheetId) {
  const rows = await readExistingLeads(sheetId);
  const colIdx = config.sheets.businessNameColumnIndex;
  const names = new Set(
    rows
      .map((r) => (r[colIdx] || '').toLowerCase().trim())
      .filter(Boolean)
  );
  console.log(`[Sheets] Found ${names.size} existing business names in sheet.`);
  return names;
}

/**
 * Append new lead rows to the sheet.
 * Expects leads as array of objects: { businessName, firstName, lastName, phone, city, website }
 */
async function appendLeads(sheetId, leads) {
  if (leads.length === 0) return 0;

  const sheets = await getSheetsClient();
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  });

  const rows = leads.map((lead) => [
    today,                      // Date Added
    lead.businessName,          // Business Name
    lead.firstName,             // Owner First Name
    lead.lastName,              // Owner Last Name
    lead.phone,                 // Phone Number
    lead.city,                  // City
    lead.website,               // Website
    '',                         // Called (blank — user fills in)
    '',                         // Notes (blank — user fills in)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${config.sheets.tabName}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`[Sheets] Appended ${rows.length} new leads to sheet.`);
  return rows.length;
}

/**
 * Verify the sheet is accessible and return basic info.
 * Used by setup.js to confirm connection.
 */
async function verifySheetAccess(sheetId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: 'properties.title,sheets.properties.title',
  });
  return {
    title: res.data.properties.title,
    tabs: res.data.sheets.map((s) => s.properties.title),
  };
}

module.exports = {
  ensureSpreadsheet,
  getExistingBusinessNames,
  appendLeads,
  verifySheetAccess,
  writeHeaders,
};
