'use strict';

const { google } = require('googleapis');
const { SHEET_COLUMNS } = require('./config');

class GoogleSheetsClient {
  /**
   * @param {object} authClient  Authenticated Google auth client from auth.js
   * @param {string} spreadsheetId  The Google Sheets spreadsheet ID
   * @param {string} sheetTab       The tab name inside the spreadsheet (e.g. "Leads")
   */
  constructor(authClient, spreadsheetId, sheetTab = 'Leads') {
    if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is required');
    this.sheets         = google.sheets({ version: 'v4', auth: authClient });
    this.spreadsheetId  = spreadsheetId;
    this.sheetTab       = sheetTab;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Ensures the header row exists in the sheet.
   * If the sheet is empty it writes the header; if it already has rows it
   * verifies the header without overwriting data.
   */
  async ensureHeaders() {
    const existing = await this._readRange(`${this.sheetTab}!A1:I1`);
    if (!existing || existing.length === 0) {
      await this._appendRows([[...SHEET_COLUMNS]]);
      console.log('  [Sheets] Header row created.');
    } else {
      console.log('  [Sheets] Header row already exists — skipping.');
    }
  }

  /**
   * Returns a Set of business names already in the sheet (lowercased for
   * case-insensitive dedup comparison).
   */
  async getExistingBusinessNames() {
    // Column B (index 1) is "Business Name". We read from row 2 to skip headers.
    const rows = await this._readRange(`${this.sheetTab}!B2:B`);
    if (!rows) return new Set();
    return new Set(rows.flat().map((name) => name.trim().toLowerCase()));
  }

  /**
   * Appends an array of lead objects to the sheet.
   * Each lead must have: businessName, firstName, lastName, phone, city, website.
   *
   * @param {Array<object>} leads
   * @param {string}        dateAdded  ISO date string for the "Date Added" column
   * @returns {number}      Number of rows actually written
   */
  async appendLeads(leads, dateAdded) {
    if (leads.length === 0) return 0;

    const rows = leads.map((lead) => [
      dateAdded,           // A: Date Added
      lead.businessName,   // B: Business Name
      lead.firstName,      // C: Owner First Name
      lead.lastName,       // D: Owner Last Name
      lead.phone,          // E: Phone Number
      lead.city,           // F: City
      lead.website,        // G: Website
      '',                  // H: Called (blank — user fills in)
      '',                  // I: Notes  (blank — user fills in)
    ]);

    await this._appendRows(rows);
    return rows.length;
  }

  /**
   * Quick connectivity test — tries to read the first cell.
   * Returns { ok: boolean, error?: string }
   */
  async testConnection() {
    try {
      await this._readRange(`${this.sheetTab}!A1:A1`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: this._friendlyError(err) };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  async _readRange(range) {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    return res.data.values ?? [];
  }

  async _appendRows(rows) {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId:     this.spreadsheetId,
      range:             `${this.sheetTab}!A1`,
      valueInputOption:  'USER_ENTERED', // Lets Sheets parse dates, URLs, etc.
      insertDataOption:  'INSERT_ROWS',  // Always append, never overwrite
      requestBody: { values: rows },
    });
  }

  _friendlyError(err) {
    const status = err.code ?? err.status;
    if (status === 401 || status === 403) return 'Auth failed — check credentials and sheet sharing permissions';
    if (status === 404) return `Spreadsheet not found. Check GOOGLE_SPREADSHEET_ID in .env`;
    if (err.message?.includes('Unable to parse range')) {
      return `Tab "${this.sheetTab}" not found in the spreadsheet. Check GOOGLE_SHEET_TAB in .env`;
    }
    return err.message ?? String(err);
  }
}

module.exports = GoogleSheetsClient;
