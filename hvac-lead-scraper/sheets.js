/**
 * Google Sheets integration.
 *
 * Reads existing business names to prevent duplicates,
 * then appends new leads in the correct column order.
 *
 * Sheet columns:
 *   A: Date Added  B: Business Name  C: Owner First Name  D: Owner Last Name
 *   E: Phone Number  F: City  G: Website  H: Called  I: Notes
 */

const { google } = require('googleapis');

const SHEET_NAME = 'Sheet1'; // Adjust if your tab has a different name

function getSheetsClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

/**
 * Fetch all business names already in the sheet (column B).
 * @returns {Promise<Set<string>>} Lowercase-normalized set of existing business names
 */
async function getExistingBusinessNames() {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!B:B`,
  });

  const rows = response.data.values || [];
  const names = rows.slice(1).map((row) => normalizeBusinessName(row[0] || ''));
  console.log(`Found ${names.length} existing businesses in sheet`);
  return new Set(names.filter(Boolean));
}

/**
 * Append new leads to the sheet, skipping duplicates.
 * @param {Array} leads - Lead objects from Apollo
 * @param {Set<string>} existingNames - Already-normalized names in the sheet
 * @returns {Promise<number>} Count of rows appended
 */
async function appendNewLeads(leads, existingNames) {
  if (leads.length === 0) {
    console.log('No leads to append');
    return 0;
  }

  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const today = new Date().toISOString().split('T')[0];

  const newLeads = leads.filter(
    (lead) => !existingNames.has(normalizeBusinessName(lead.businessName))
  );

  if (newLeads.length === 0) {
    console.log('All leads are duplicates — nothing new to add');
    return 0;
  }

  console.log(`Appending ${newLeads.length} new leads (filtered ${leads.length - newLeads.length} duplicates)`);

  const rows = newLeads.map((lead) => [
    today,
    lead.businessName,
    lead.ownerFirstName,
    lead.ownerLastName,
    lead.phoneNumber,
    lead.city,
    lead.website,
    '',
    '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`✓ Appended ${newLeads.length} leads to spreadsheet`);
  return newLeads.length;
}

function normalizeBusinessName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { getExistingBusinessNames, appendNewLeads };
