const { google } = require('googleapis');
const path = require('path');
const { config } = require('./config');

let sheetsClient = null;

// Initializes and caches the authenticated Google Sheets client
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const keyPath = path.resolve(config.serviceAccountKeyPath);
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// Returns all values in the sheet as a 2D array
async function readAllRows() {
  const sheets = await getSheetsClient();
  const range = `${config.sheetTab}!A:Z`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });

  return res.data.values || [];
}

// Ensures the header row exists; writes it if the sheet is empty
async function ensureHeaders() {
  const rows = await readAllRows();
  if (rows.length === 0) {
    await appendRows([config.sheetHeaders]);
    console.log('[Sheets] Header row written.');
  }
}

// Appends one or more rows to the sheet
async function appendRows(rows) {
  const sheets = await getSheetsClient();
  const range = `${config.sheetTab}!A1`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

// Returns the set of business names already in the sheet (lowercase for comparison)
async function getExistingBusinessNames() {
  const rows = await readAllRows();
  const names = new Set();

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i]?.[config.businessNameColIndex];
    if (name) names.add(name.toLowerCase().trim());
  }

  return names;
}

// Appends new leads, skipping any whose business name is already present
// Returns counts: { added, skipped }
async function appendNewLeads(leads) {
  await ensureHeaders();
  const existing = await getExistingBusinessNames();

  const toAdd = [];
  let skipped = 0;

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key || existing.has(key)) {
      skipped++;
      continue;
    }
    existing.add(key); // Prevent duplicates within this batch too

    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
    });

    toAdd.push([
      today,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '', // Called — left blank
      '', // Notes — left blank
    ]);
  }

  if (toAdd.length > 0) {
    await appendRows(toAdd);
  }

  return { added: toAdd.length, skipped };
}

module.exports = { appendNewLeads, readAllRows, ensureHeaders };
