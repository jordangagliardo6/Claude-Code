'use strict';

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Returns an authenticated Google Sheets client using the service account
 * credentials file specified in .env (GOOGLE_CREDENTIALS_PATH).
 */
async function getAuth() {
  const credPath = path.resolve(config.credentialsPath);

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google credentials file not found at: ${credPath}\n` +
      `See credentials/README.md for setup instructions.`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth.getClient();
}

// ─── Sheet Helpers ────────────────────────────────────────────────────────────

/**
 * Read all rows from the target sheet.
 * Returns a 2-D array (rows × columns), including the header row.
 */
async function readAllRows(sheetsClient) {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: `${config.sheetTab}`,
  });
  return res.data.values ?? [];
}

/**
 * Write the header row if the sheet is completely empty.
 * This protects against a blank sheet on the very first run.
 */
async function ensureHeader(sheetsClient) {
  const rows = await readAllRows(sheetsClient);

  if (rows.length === 0) {
    logger.info('Sheet is empty — writing header row…');
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range: `${config.sheetTab}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [config.SHEET_COLUMNS] },
    });
    logger.success('Header row written.');
    return [];
  }

  // Verify the header matches the expected columns
  const header = rows[0];
  const expected = config.SHEET_COLUMNS;
  const matches = expected.every((col, i) => header[i] === col);
  if (!matches) {
    logger.warn(
      `Sheet header mismatch!\n` +
      `  Expected: ${expected.join(', ')}\n` +
      `  Found:    ${header.join(', ')}\n` +
      `  Continuing anyway — check column alignment.`
    );
  }

  return rows.slice(1); // return data rows only (skip header)
}

/**
 * Fetch the set of already-known business names (lowercased) for dedup.
 */
async function getExistingBusinessNames(sheetsClient) {
  const rows = await readAllRows(sheetsClient);
  if (rows.length <= 1) return new Set();

  // Column B (index 1) = Business Name
  const businessNameColIndex = config.SHEET_COLUMNS.indexOf('Business Name');
  return new Set(
    rows
      .slice(1)
      .map(row => (row[businessNameColIndex] ?? '').trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Append an array of lead objects to the sheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @param {object[]} leads   Normalised lead records.
 * @param {Set<string>} existingNames  Lowercased business names already in sheet.
 * @returns {number}  How many new rows were actually written.
 */
async function appendLeads(leads, existingNames) {
  if (!config.sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in your .env file.');
  }

  const authClient = await getAuth();
  const sheetsClient = google.sheets({ version: 'v4', auth: authClient });

  await ensureHeader(sheetsClient);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: config.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const newRows = [];

  for (const lead of leads) {
    const nameLower = (lead.businessName ?? '').trim().toLowerCase();

    if (!nameLower) {
      logger.warn(`Skipping lead with no business name (Apollo ID: ${lead.apolloId})`);
      continue;
    }

    if (existingNames.has(nameLower)) {
      logger.info(`Duplicate — skipping: "${lead.businessName}"`);
      continue;
    }

    // Build the row in SHEET_COLUMNS order
    newRows.push([
      today,                // Date Added
      lead.businessName,    // Business Name
      lead.firstName,       // Owner First Name
      lead.lastName,        // Owner Last Name
      lead.phone,           // Phone Number
      lead.city,            // City
      lead.website,         // Website
      '',                   // Called  (blank — you fill this in)
      '',                   // Notes   (blank — you fill this in)
    ]);

    existingNames.add(nameLower); // prevent dupes within this batch
  }

  if (newRows.length === 0) {
    logger.info('No new leads to write after dedup.');
    return 0;
  }

  logger.info(`Writing ${newRows.length} new lead(s) to the sheet…`);

  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: config.sheetId,
    range: `${config.sheetTab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  logger.success(`${newRows.length} lead(s) added to the sheet.`);
  return newRows.length;
}

/**
 * Standalone test — called by setup.js to verify Google Sheets access.
 */
async function testConnection() {
  if (!config.sheetId) throw new Error('GOOGLE_SHEET_ID not set.');
  const authClient = await getAuth();
  const sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: config.sheetId });
  return meta.data.properties.title;
}

module.exports = { appendLeads, getExistingBusinessNames, testConnection, getAuth };
