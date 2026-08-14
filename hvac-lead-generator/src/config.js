require('dotenv').config();

module.exports = {
  // ── Google Sheets ──────────────────────────────────────────────────────────
  // Taken from the "SW Michigan HVAC Leads" spreadsheet URL already in Drive.
  spreadsheetId: '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus',
  // The tab name inside the spreadsheet. Change this if your tab has a different name.
  sheetName: process.env.SHEET_TAB_NAME || 'Sheet1',

  // ── Target Cities ──────────────────────────────────────────────────────────
  // Add or remove cities here to change the search territory.
  targetCities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // ── Apollo.io Search Filters ───────────────────────────────────────────────
  apollo: {
    // Decision-maker titles in priority order
    personTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

    // 1–25 employees (owner-operated small businesses)
    employeeRanges: ['1,10', '11,25'],

    // NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors
    // NAICS 238210 = Electrical Contractors / Mechanical Wiring
    naicsCodes: ['23822', '23821'],

    // Keywords broaden the net to catch companies tagged differently
    keywords: 'HVAC heating air conditioning plumbing mechanical contracting Michigan',

    // Filter people who are physically in Michigan
    personLocations: ['Michigan, United States'],

    // Filter companies headquartered in Michigan
    organizationLocations: ['Michigan, United States'],

    // Maximum leads added per daily run — keeps the list manageable
    maxLeadsPerRun: 25,
  },

  // ── Scheduler ──────────────────────────────────────────────────────────────
  // "0 7 * * *" = every day at 7:00 AM.
  // node-cron respects the TZ env variable set in .env.
  cronSchedule: '0 7 * * *',

  // ── Notifications ──────────────────────────────────────────────────────────
  notificationEmail: process.env.NOTIFICATION_EMAIL || 'jgagliardo98@gmail.com',

  // ── Spreadsheet Column Order ───────────────────────────────────────────────
  // Matches the header row already in the spreadsheet. Do not reorder without
  // also updating the appendLeads() method in sheetsManager.js.
  columns: [
    'Date Added',
    'Business Name',
    'Owner First Name',
    'Owner Last Name',
    'Phone Number',
    'City',
    'Website',
    'Called',
    'Notes',
  ],
};
