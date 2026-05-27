const { google } = require('googleapis');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const SHEET_TAB = 'Sheet1';

// Build a GoogleAuth client from whichever credential env var is present
function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (keyFile) {
    return new google.auth.GoogleAuth({
      keyFile: path.resolve(keyFile),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  if (keyJson) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(keyJson),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  throw new Error(
    'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE ' +
    'or GOOGLE_SERVICE_ACCOUNT_JSON in your .env file.'
  );
}

function sheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// Write the header row if the sheet is blank
async function ensureHeaders(client) {
  const res = await client.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `${SHEET_TAB}!A1:I1`,
  });
  const firstRow = res.data.values?.[0] ?? [];
  if (firstRow[0] !== 'Date Added') {
    await client.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [config.HEADERS] },
    });
    logger.info('Header row written to spreadsheet.');
  }
}

// Return a Set of lowercased business names already in the sheet
async function getExistingNames(client) {
  const res = await client.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `${SHEET_TAB}!B:B`, // Business Name column only
  });
  const rows = res.data.values ?? [];
  return new Set(rows.slice(1).map(r => (r[0] ?? '').toLowerCase().trim()));
}

// Append new leads to the sheet, skipping any already present
async function appendLeads(leads) {
  const client = sheetsClient();
  await ensureHeaders(client);
  const existing = await getExistingNames(client);
  logger.info(`Sheet has ${existing.size} existing business(es) to deduplicate against.`);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const toAdd = leads.filter(lead => {
    const key = lead.businessName.toLowerCase().trim();
    if (existing.has(key)) {
      logger.info(`  Skipping duplicate: "${lead.businessName}"`);
      return false;
    }
    return true;
  });

  if (toAdd.length === 0) {
    logger.info('All leads this run were duplicates — nothing new to append.');
    return 0;
  }

  const rows = toAdd.map(lead => [
    today,
    lead.businessName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.city,
    lead.website,
    '', // Called
    '', // Notes
  ]);

  await client.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  logger.info(`Appended ${toAdd.length} new lead(s) to spreadsheet.`);
  return toAdd.length;
}

// Return the spreadsheet title to confirm we can reach it
async function verifyConnection() {
  const client = sheetsClient();
  const res = await client.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    fields: 'properties.title',
  });
  return res.data.properties.title;
}

module.exports = { appendLeads, verifyConnection };
