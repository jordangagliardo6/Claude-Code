'use strict';

const path  = require('path');
const { google } = require('googleapis');
const { SHEET_COLUMNS } = require('../config');

// The worksheet tab name — change if yours is different
const TAB_NAME = 'Sheet1';

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'credentials.json';
  const resolved = path.isAbsolute(keyFile)
    ? keyFile
    : path.join(__dirname, '..', keyFile);

  return new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  return id;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Ensure the header row exists; create it if the sheet is empty.
 */
async function ensureHeaders() {
  const sheets   = await getSheetsClient();
  const sheetId  = getSheetId();
  const existing = await readAllRows(sheets, sheetId);

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range:         `${TAB_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_COLUMNS] },
    });
    console.log('Created header row in sheet.');
  }
}

/**
 * Read every Business Name already in the sheet.
 * Returns a Set<string> of lowercased names for O(1) duplicate lookups.
 */
async function getExistingBusinessNames() {
  const sheets  = await getSheetsClient();
  const sheetId = getSheetId();
  const rows    = await readAllRows(sheets, sheetId);

  // Row 0 is the header — skip it
  const businessNameCol = SHEET_COLUMNS.indexOf('Business Name');
  const names = new Set();
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][businessNameCol] || '').toString().trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

/**
 * Append an array of lead objects to the sheet.
 * Each lead must have: businessName, firstName, lastName, phone, city, website.
 *
 * @param {Array<Object>} leads
 * @returns {number} How many rows were actually appended
 */
async function appendLeads(leads) {
  if (!leads.length) return 0;

  const sheets  = await getSheetsClient();
  const sheetId = getSheetId();
  const today   = todayFormatted();

  const rows = leads.map(lead => buildRow(lead, today));

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range:         `${TAB_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return rows.length;
}

/**
 * Lightweight check that the credentials work and the sheet is accessible.
 */
async function testConnection() {
  const sheets  = await getSheetsClient();
  const sheetId = getSheetId();

  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  return res.data.properties?.title || '(untitled sheet)';
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

async function getSheetsClient() {
  const auth = getAuth();
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function readAllRows(sheets, sheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${TAB_NAME}!A:Z`,
  });
  return res.data.values || [];
}

/**
 * Build a row array in the exact order defined by SHEET_COLUMNS.
 * Adding a new column to config.js is all that's needed to extend this.
 */
function buildRow(lead, dateAdded) {
  const map = {
    'Date Added':       dateAdded,
    'Business Name':    lead.businessName,
    'Owner First Name': lead.firstName,
    'Owner Last Name':  lead.lastName,
    'Phone Number':     formatPhoneDisplay(lead.phone),
    'City':             lead.city,
    'Website':          lead.website,
    'Called':           '',
    'Notes':            '',
  };
  return SHEET_COLUMNS.map(col => map[col] ?? '');
}

function formatPhoneDisplay(digits) {
  if (!digits || digits.length !== 10) return digits || '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function todayFormatted() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

module.exports = { ensureHeaders, getExistingBusinessNames, appendLeads, testConnection };
