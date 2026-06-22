const { google } = require('googleapis');
const config = require('./config');
const { getAuthedClient } = require('./googleAuth');

function getSheetsApi() {
  return google.sheets({ version: 'v4', auth: getAuthedClient() });
}

// Writes the header row if the tab is currently empty. Safe to call on
// every run -- it's a no-op once the header exists.
async function ensureHeaderRow() {
  const sheets = getSheetsApi();
  const { spreadsheetId, tabName, columns } = config.googleSheets;

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:A1`,
  });

  if (data.values && data.values.length > 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [columns] },
  });
}

// Returns the set of business names already in the sheet (column index
// matches whatever position "Business Name" has in config.columns), used
// to skip duplicates before appending new leads.
async function getExistingBusinessNames() {
  const sheets = getSheetsApi();
  const { spreadsheetId, tabName, columns } = config.googleSheets;
  const businessNameColIdx = columns.indexOf('Business Name');

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A2:Z`,
  });

  const rows = data.values || [];
  const names = rows
    .map((row) => (row[businessNameColIdx] || '').trim().toLowerCase())
    .filter(Boolean);

  return new Set(names);
}

// Appends lead objects (keyed by column name, e.g. { 'Business Name': ... })
// as new rows, in the column order defined in config.googleSheets.columns.
async function appendLeads(leads) {
  if (leads.length === 0) return;

  const sheets = getSheetsApi();
  const { spreadsheetId, tabName, columns } = config.googleSheets;

  const values = leads.map((lead) => columns.map((col) => lead[col] ?? ''));

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

module.exports = { ensureHeaderRow, getExistingBusinessNames, appendLeads };
