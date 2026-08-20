const { google } = require('googleapis');
const fs = require('fs');

const SHEET_TAB = 'Sheet1';

// Column order matches the spreadsheet headers exactly
const HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

async function getAuthClient(credentialsPath) {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

async function ensureHeaders(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A1:I1`,
  });
  const row = res.data.values?.[0] || [];
  if (row[0] !== 'Date Added') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

async function getExistingBusinessNames(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!B:B`, // Business Name column
  });
  const rows = res.data.values || [];
  return new Set(
    rows.flat().map(n => n.trim().toLowerCase()).filter(Boolean)
  );
}

async function appendLeads(spreadsheetId, credentialsPath, leads) {
  const authClient = await getAuthClient(credentialsPath);
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  await ensureHeaders(sheets, spreadsheetId);
  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const newRows = leads
    .filter(lead => {
      if (!lead.businessName) return false;
      return !existingNames.has(lead.businessName.trim().toLowerCase());
    })
    .map(lead => [
      today,
      lead.businessName,
      lead.ownerFirstName,
      lead.ownerLastName,
      lead.phoneNumber,
      lead.city,
      lead.website,
      '', // Called — left blank
      '', // Notes — left blank
    ]);

  const skipped = leads.length - newRows.length;

  if (newRows.length === 0) {
    return { added: 0, skipped };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows },
  });

  return { added: newRows.length, skipped };
}

module.exports = { appendLeads };
