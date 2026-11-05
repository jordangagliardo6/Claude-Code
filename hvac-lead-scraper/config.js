/**
 * config.js – Central configuration for the HVAC lead scraper.
 * Edit this file to change cities, industries, company size, or column layout.
 */
require('dotenv').config();

module.exports = {
  // ── Apollo.io ────────────────────────────────────────────────────────────────
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/api/v1',

    // Maximum leads to pull per scheduled run
    maxLeadsPerRun: 25,

    // Job titles to target (searched in priority order; Apollo returns best matches)
    personTitles: [
      'Owner',
      'President',
      'Founder',
      'Co-Founder',
      'General Manager',
    ],

    // Company location filter – Apollo uses "City, State, Country" or "State, Country"
    organizationLocations: ['Michigan, United States'],

    // Southwest Michigan cities – used to bias/filter results after Apollo returns them
    // Add or remove cities freely; this list is also injected into the keyword query
    targetCities: [
      'St. Joseph',
      'Benton Harbor',
      'Kalamazoo',
      'Holland',
      'Grand Haven',
      'Muskegon',
      'South Haven',
    ],

    // Company employee count range (1–25 = owner-operated small businesses)
    // Format: ["min,max"]  |  use "1,25" for 1–25 employees
    employeeRanges: ['1,25'],

    // Apollo "industry tag" approach: we search by keyword because HVAC tag IDs
    // vary by account. If you know your Apollo industry tag IDs, replace the
    // `q_keywords` approach in apollo.js with `organization_industry_tag_ids`.
    industryTerms: ['HVAC', 'plumbing', 'heating and air', 'mechanical contracting', 'air conditioning'],
  },

  // ── Google Sheets ────────────────────────────────────────────────────────────
  sheets: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    sheetName: process.env.SHEET_NAME || 'Leads',

    // Column order written to the sheet (must match your spreadsheet exactly)
    // To reorder or add columns, change both this array and the row-builder in sheets.js
    headers: [
      'Date Added',
      'Business Name',
      'Owner First Name',
      'Owner Last Name',
      'Phone Number',
      'City',
      'Website',
      'Called',   // left blank – you fill this manually
      'Notes',    // left blank – you fill this manually
    ],

    // Which column index (0-based) holds "Business Name" – used for dupe check
    businessNameColumnIndex: 1,
  },

  // ── Scheduler ────────────────────────────────────────────────────────────────
  schedule: {
    // 7:00 AM every day, Eastern Time (handles EST/EDT automatically)
    cron: '0 7 * * *',
    timezone: 'America/New_York',
  },

  // ── Notifications ────────────────────────────────────────────────────────────
  notification: {
    email: process.env.NOTIFICATION_EMAIL || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
};
