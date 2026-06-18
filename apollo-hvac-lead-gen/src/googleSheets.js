// Reads existing leads (for dedupe) and appends new ones to the Google Sheet.

const { google } = require('googleapis');
const config = require('../config');
const { loadOauthClient } = require('./googleAuth');

function columnLetter(index) {
  // 0 -> A, 1 -> B, ...
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

function sheetsClient() {
  return google.sheets({ version: 'v4', auth: loadOauthClient() });
}

// Returns a Set of business names already in the sheet (trimmed, lowercased)
// so the workflow can skip anything already added.
async function getExistingBusinessNames() {
  const sheets = sheetsClient();
  const businessNameCol = columnLetter(config.sheetColumns.indexOf('Business Name'));
  const range = `${config.googleSheetTabName}!${businessNameCol}2:${businessNameCol}`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range,
  });

  const rows = res.data.values || [];
  return new Set(rows.map((row) => (row[0] || '').trim().toLowerCase()).filter(Boolean));
}

// Appends an array of lead objects (already in config.sheetColumns order) to
// the sheet. `leads` items are arrays, one value per column.
async function appendLeads(leadRows) {
  if (leadRows.length === 0) return;

  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${config.googleSheetTabName}!A:${columnLetter(config.sheetColumns.length - 1)}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: leadRows },
  });
}

// Confirms the sheet is reachable and the header row matches config. Used by
// scripts/testConnection.js.
async function verifyConnection() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${config.googleSheetTabName}!1:1`,
  });
  return res.data.values ? res.data.values[0] : [];
}

module.exports = { getExistingBusinessNames, appendLeads, verifyConnection, columnLetter };
