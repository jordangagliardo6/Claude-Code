/**
 * Google Sheets API Client
 *
 * Reads existing rows (for deduplication) and appends new lead rows to the
 * target spreadsheet.
 *
 * Authentication: Service-Account JSON key stored at the path pointed to by
 * GOOGLE_SERVICE_ACCOUNT_KEY_FILE env var, OR OAuth2 tokens in credentials/.
 * Service-account auth is simpler for automated/headless runs and is the
 * recommended approach — see setup.js for details.
 *
 * Column layout (must match COLUMNS below exactly):
 *   A: Date Added | B: Business Name | C: Owner First Name | D: Owner Last Name
 *   E: Phone Number | F: City | G: Website | H: Called | I: Notes
 */

'use strict';

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// ─── Column map — edit here if you add/remove columns ────────────────────────
const COLUMNS = {
  DATE_ADDED: 0,    // A
  BUSINESS_NAME: 1, // B  ← used for deduplication
  FIRST_NAME: 2,    // C
  LAST_NAME: 3,     // D
  PHONE: 4,         // E
  CITY: 5,          // F
  WEBSITE: 6,       // G
  CALLED: 7,        // H (left blank intentionally)
  NOTES: 8,         // I (left blank intentionally)
};

const SHEET_NAME = process.env.SHEET_TAB_NAME || 'Leads';
const DATA_RANGE = `${SHEET_NAME}!A:I`;

class SheetsClient {
  constructor(spreadsheetId) {
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID env var is required');
    this.spreadsheetId = spreadsheetId;
    this._auth = null;
    this._sheets = null;
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async _getSheets() {
    if (this._sheets) return this._sheets;

    const auth = await this._buildAuth();
    this._sheets = google.sheets({ version: 'v4', auth });
    return this._sheets;
  }

  async _buildAuth() {
    // Preferred: service-account JSON key file
    const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
    if (keyFile) {
      if (!fs.existsSync(keyFile)) {
        throw new Error(`Service account key file not found: ${keyFile}`);
      }
      const auth = new google.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      return auth;
    }

    // Fallback: OAuth2 with tokens stored in credentials/oauth_token.json
    const tokenPath = path.join(__dirname, '..', 'credentials', 'oauth_token.json');
    const credPath = path.join(__dirname, '..', 'credentials', 'oauth_credentials.json');

    if (!fs.existsSync(credPath)) {
      throw new Error(
        'No Google auth method found. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or place ' +
        'OAuth credentials at credentials/oauth_credentials.json. See setup.js.'
      );
    }

    const { client_secret, client_id, redirect_uris } = JSON.parse(
      fs.readFileSync(credPath)
    ).installed;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (!fs.existsSync(tokenPath)) {
      throw new Error(
        'OAuth token not found. Run `node setup.js` to complete the one-time authorization.'
      );
    }

    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));
    return oAuth2Client;
  }

  // ─── Header bootstrap ─────────────────────────────────────────────────────

  /**
   * Ensure row 1 has the correct header. Safe to call on every run — it will
   * only write if row 1 is completely empty.
   */
  async ensureHeader() {
    const sheets = await this._getSheets();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!A1:I1`,
    });

    if (data.values && data.values[0] && data.values[0].some(Boolean)) {
      logger.info('Sheet header already exists — skipping header write');
      return;
    }

    const header = [
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

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!A1:I1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    });

    logger.info('Header row written to spreadsheet');
  }

  // ─── Read existing data (for deduplication) ────────────────────────────────

  /**
   * Returns a Set of lowercase business names already in the sheet.
   */
  async getExistingBusinessNames() {
    const sheets = await this._getSheets();

    try {
      const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${SHEET_NAME}!B2:B`, // Business Name column only
      });

      if (!data.values) return new Set();

      return new Set(
        data.values
          .flat()
          .filter(Boolean)
          .map((n) => n.toString().trim().toLowerCase())
      );
    } catch (err) {
      logger.warn(`Could not read existing names (${err.message}) — proceeding without dedup`);
      return new Set();
    }
  }

  // ─── Append new leads ─────────────────────────────────────────────────────

  /**
   * Appends an array of lead objects to the sheet.
   * Returns the number of rows actually written.
   */
  async appendLeads(leads) {
    if (!leads.length) {
      logger.info('No leads to append');
      return 0;
    }

    const sheets = await this._getSheets();
    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
    });

    const rows = leads.map((lead) => {
      const row = new Array(9).fill('');
      row[COLUMNS.DATE_ADDED] = today;
      row[COLUMNS.BUSINESS_NAME] = lead.businessName;
      row[COLUMNS.FIRST_NAME] = lead.firstName;
      row[COLUMNS.LAST_NAME] = lead.lastName;
      row[COLUMNS.PHONE] = lead.phone;
      row[COLUMNS.CITY] = lead.city;
      row[COLUMNS.WEBSITE] = lead.website;
      // COLUMNS.CALLED and COLUMNS.NOTES are intentionally left blank
      return row;
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: DATA_RANGE,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    logger.info(`Appended ${rows.length} new lead(s) to spreadsheet`);
    return rows.length;
  }

  // ─── Connectivity test (used by setup.js) ─────────────────────────────────

  async testConnection() {
    const sheets = await this._getSheets();
    const { data } = await sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'properties.title',
    });
    return data.properties?.title || '(untitled)';
  }
}

module.exports = { SheetsClient, COLUMNS };
