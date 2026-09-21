require('dotenv').config();

module.exports = {
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',

    // Target cities in Southwest Michigan
    // Add or remove cities here to adjust the search area
    targetCities: [
      'St. Joseph, Michigan',
      'Benton Harbor, Michigan',
      'Kalamazoo, Michigan',
      'Holland, Michigan',
      'Grand Haven, Michigan',
      'Muskegon, Michigan',
      'South Haven, Michigan',
      'Stevensville, Michigan',
      'Watervliet, Michigan',
      'Paw Paw, Michigan',
      'Three Rivers, Michigan',
      'Coloma, Michigan',
    ],

    // Industries to target — change these if you want to expand/narrow scope
    industryKeywords: [
      'HVAC',
      'Heating and Air Conditioning',
      'Plumbing',
      'Mechanical Contracting',
    ],

    // Job titles to target, in priority order
    // Lower index = higher priority (searched first)
    targetTitles: [
      'Owner',
      'President',
      'Founder',
      'Co-Founder',
      'General Manager',
    ],

    // Employee count range for owner-operated small businesses
    employeeRanges: ['1,10', '11,25'],

    maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  },

  google: {
    credentialsFile: process.env.GOOGLE_CREDENTIALS_FILE || './credentials.json',
    spreadsheetId: process.env.SPREADSHEET_ID,
    sheetTabName: process.env.SHEET_TAB_NAME || 'Sheet1',

    // Column order in the spreadsheet — must match what's in your sheet header row
    // If you add or reorder columns, update both this array and the buildRow() function in sheets.js
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
  },

  scheduler: {
    timezone: process.env.TIMEZONE || 'America/New_York',
    cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
  },

  alerts: {
    email: process.env.ALERT_EMAIL || null,
  },
};
