const { google } = require('googleapis');

class SheetsManager {
  constructor({ spreadsheetId, sheetName, credentials }) {
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  // Returns the spreadsheet title — used by setup.js to confirm the connection.
  async testConnection() {
    const res = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    return res.data.properties.title;
  }

  // Returns a lowercase Set of all business names already in column B (skipping the header).
  // Used for duplicate checking before inserting.
  async getExistingBusinessNames() {
    const range = this.sheetName ? `${this.sheetName}!B:B` : 'B:B';
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    const rows = res.data.values || [];
    // Row 0 is the header "Business Name" — skip it
    return new Set(
      rows.slice(1).map(row => (row[0] || '').toLowerCase().trim()).filter(Boolean)
    );
  }

  // Appends an array of lead objects to the sheet. Returns the count added.
  // Lead shape: { dateAdded, businessName, ownerFirstName, ownerLastName,
  //               phoneNumber, city, website }
  async appendLeads(leads) {
    if (!leads.length) return 0;

    const range = this.sheetName ? `${this.sheetName}!A:I` : 'A:I';

    const rows = leads.map(lead => [
      lead.dateAdded,
      lead.businessName,
      lead.ownerFirstName || '',
      lead.ownerLastName || '',
      lead.phoneNumber || '',
      lead.city || '',
      lead.website || '',
      '',   // Called  — intentionally blank
      '',   // Notes   — intentionally blank
    ]);

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    return leads.length;
  }
}

module.exports = SheetsManager;
